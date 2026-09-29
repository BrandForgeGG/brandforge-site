// Database operations for BrandForge chat-first project state.
//
// Every query runs through the request-scoped Supabase server client, so Postgres row
// level security is enforced for the signed-in founder. The database - never the AI
// response - is the source of truth for requirements, estimates and milestones.
//
// One conversation equals one project: conversations hang off conversations.id and
// nothing here reaches across conversations.

import { createSupabaseServerClient } from './supabase/server';
import { createSupabaseAdminClient } from './supabase/admin';
import type { SupabaseClient } from '@supabase/supabase-js';
import { track } from './funnel.js';
import { safeDownloadName } from './message-actions.js';
import { notifyDiscordDiscovery } from './discord';
import { notifyUser } from './notify';
import { postOpsEvent, postPublicActivity } from './ops-events';
import { headers } from 'next/headers';

import { validateUsername } from '@/lib/identity';

// Admin-only funnel read. Lives here (rather than in the API route) so the service-role client
// stays confined to this single allow-listed module, preserving the H7 boundary.
export async function getFunnelSummary(limit = 10000) {
  const admin = createSupabaseAdminClient();

  if (!admin) {
    return null;
  }

  const { data, error } = await admin
    .from('funnel_events')
    .select('event, created_at')
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    // The table is missing until migration 0012 is applied; that is an expected, non-fatal state.
    if (error.code === '42P01') {
      return null;
    }
    console.error('Funnel summary error:', error.message);
    return null;
  }

  const rows = (data ?? []) as { event: string; created_at: string }[];

  const counts = new Map<string, number>();
  let first: string | null = null;
  let last: string | null = null;

  for (const row of rows) {
    counts.set(row.event, (counts.get(row.event) ?? 0) + 1);
    if (!first) first = row.created_at;
    last = row.created_at;
  }

  return {
    window: { firstEventAt: first, lastEventAt: last, eventsCounted: rows.length },
    counts,
  };
}

// Weekly growth stats for the ops digest (admin-only route). Service-role counts so
// the numbers never depend on the caller's RLS visibility; counts only, no content.
export async function getWeeklyStats(
  sinceIso?: string
): Promise<{ posted: number; matched: number; funded: number; shipped: number }> {
  const empty = { posted: 0, matched: 0, funded: 0, shipped: 0 };
  const admin = createSupabaseAdminClient();
  if (!admin) {
    console.error('Error loading weekly stats: service role client not configured');
    return empty;
  }
  const since = sinceIso ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [posted, matched, funded, shipped] = await Promise.all([
    admin.from('conversations').select('id', { count: 'exact', head: true }).gte('created_at', since),
    admin.from('funnel_events').select('id', { count: 'exact', head: true }).eq('event', 'proposal_accepted').gte('created_at', since),
    admin.from('funnel_events').select('id', { count: 'exact', head: true }).eq('event', 'funding_verified').gte('created_at', since),
    admin.from('funnel_events').select('id', { count: 'exact', head: true }).eq('event', 'payment_released').gte('created_at', since),
  ]);

  for (const result of [posted, matched, funded, shipped]) {
    if (result.error) {
      console.error('Error loading weekly stats:', result.error.message);
      return empty;
    }
  }

  return {
    posted: posted.count ?? 0,
    matched: matched.count ?? 0,
    funded: funded.count ?? 0,
    shipped: shipped.count ?? 0,
  };
}

export type ProjectDbClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

// Server-side funnel recording. The events table has no client INSERT policy on purpose, so every
// write goes through this function using the service role. `signedIn` is a boolean rather than an
// account id: a funnel can be read without joining events back to a person. The visitor id is an
// opaque, client-generated first-party id, not the user id and not the email.
//
// Failure behaviour: this function never throws and never changes the caller's status code, so a
// broken metrics write can never fail a product action. It is *not* fire-and-forget, though — call
// sites await it, which means the write is on the request's critical path. That is deliberate: on
// serverless an un-awaited promise can be frozen when the response is sent, which would silently
// drop the event. The cost is one indexed insert per event on the routes that call it, on the
// payment path included. If that latency ever matters, the fix is to buffer events and flush them
// from a cron or queue — not to drop the await.
//
// When the table is missing (migration 0012 not applied yet) this warns once and no-ops, so wiring
// call sites before the migration is safe.
let funnelUnavailableLogged = false;

export async function recordFunnelEvent(
  event: string,
  options: { signedIn?: boolean; visitorId?: string; properties?: Record<string, unknown> } = {}
) {
  const admin = createSupabaseAdminClient();

  if (!admin) {
    return;
  }

  const result = await track(event, {
    signedIn: options.signedIn ?? false,
    visitorId: options.visitorId ?? '',
    properties: options.properties,
    insert: async (row) => {
      const { error } = await admin.from('funnel_events').insert(row);

      if (error) {
        // 42P01 = undefined_table: migration 0012 has not been applied yet. That is an expected,
        // non-fatal state during rollout, so warn once instead of on every page view.
        if (error.code === '42P01') {
          if (!funnelUnavailableLogged) {
            funnelUnavailableLogged = true;
            console.warn('funnel_events table missing — apply migration 0012_funnel_events.sql');
          }
          return;
        }
        throw new Error(error.message);
      }
    },
  });

  return result;
}

async function db(): Promise<ProjectDbClient> {
  // Route handlers cannot always expose their NextRequest here, so read the
  // middleware-forwarded cookie header from next/headers instead.
  const headerStore = await headers();
  const forwarded = headerStore.get('x-forwarded-cookie') ?? headerStore.get('cookie') ?? '';
  const fakeRequest = {
    cookies: { getAll: () => [] },
    headers: new Headers({ 'x-forwarded-cookie': forwarded }),
  } as unknown as Parameters<typeof createSupabaseServerClient>[0];
  return createSupabaseServerClient(fakeRequest);
}

export interface ProjectContext {
  id?: string;
  conversation_id: string;
  project_name?: string | null;
  problem_statement?: string | null;
  target_users?: string[] | null;
  platforms?: string[] | null;
  requirements_count?: number | null;
  open_questions_count?: number | null;
  assumptions_count?: number | null;
  estimated_weeks_min?: number | null;
  estimated_weeks_max?: number | null;
  estimated_cost_min?: number | null;
  estimated_cost_max?: number | null;
  currency?: string | null;
  discovery_completeness?: number | null;
  updated_at?: string | null;
}

export interface Requirement {
  id?: string;
  conversation_id: string;
  category: 'feature' | 'constraint' | 'preference' | 'technical' | 'open_question';
  title: string;
  description?: string | null;
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'captured' | 'clarified' | 'accepted' | 'rejected' | 'open' | 'resolved';
  created_at?: string;
}

export interface Decision {
  id?: string;
  conversation_id: string;
  category: 'design' | 'scope' | 'technical' | 'timeline' | 'budget';
  title: string;
  description?: string | null;
  decision: string;
  decided_by: string;
}

export interface Milestone {
  id?: string;
  conversation_id: string;
  proposal_id?: string | null;
  sequence: number;
  title: string;
  description?: string | null;
  amount?: number | null;
  currency?: string | null;
  estimated_weeks?: number | null;
  status?: string | null;
  created_at?: string;
}

export interface ConversationSummary {
  id: string;
  title: string;
  status: string;
  messageCount: number;
  lastActivity: string | null;
  preview: string | null;
  /** Conversation owner - lets staff clients tell "my chat" apart from "a founder's chat". */
  ownerId: string;
  /** First BrandForge staff member in the chat - the founder sees that the team has arrived. */
  staffViewedAt: string | null;
  staffViewedBy: string | null;
  /** True while no staff member has opened the chat (drives the staff "new chats" badge). */
  isUnseen: boolean;
}

export interface ConversationMessage {
  id: string;
  conversation_id: string;
  sender_type: string;
  sender_name: string | null;
  content: string;
  content_type: string | null;
  artifact_data?: Record<string, unknown> | null;
  sender_id?: string | null;
  edited_at?: string | null;
  deleted_at?: string | null;
  reactions?: MessageReaction[];
  created_at: string;
}

export interface MessageReaction {
  emoji: string;
  count: number;
  reactedByMe: boolean;
}

// ---------- Profile roles ----------

export type ProfileRole = 'admin' | 'operator' | 'client' | 'designer' | 'viewer';

// profiles.role is the source of truth for staff/admin access. RLS only lets a user read
// their own profile, which is exactly the row we need for server-side role checks.
export async function getProfileRole(userId: string): Promise<ProfileRole | null> {
  const supabase = await db();

  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('Error fetching profile role:', error.message);
    return null;
  }

  return (data?.role as ProfileRole | undefined) ?? null;
}

export async function isStaffAccount(userId: string): Promise<boolean> {
  const role = await getProfileRole(userId);
  return role === 'operator' || role === 'admin';
}

export async function isAdminAccount(userId: string): Promise<boolean> {
  const role = await getProfileRole(userId);
  return role === 'admin';
}

//
// Every person is a person: a public sequential number, a chosen handle, and an
// optional Telegram delivery target. These reads use the caller's own client so
// RLS decides visibility -- a user sees their own row and nothing else, except
// for participants in a conversation they can already access, which is what
// the hover profile card needs.

export interface ProfileIdentity {
  userId: string;
  displayId: number | null;
  username: string | null;
  displayName: string | null;
  email: string | null;
  role: ProfileRole | null;
  /** Google-uploaded profile image when the member has one; deterministic initials otherwise. */
  avatarUrl: string | null;
  telegramChatId: string | null;
  telegramUsername: string | null;
  createdAt: string | null;
}

// display_id is assigned by the 0009 trigger, but a profile row created before
// that migration (or by an older insert path) can still be null, so we always
// treat it as optional rather than letting a null break a render.
export function shapeProfileIdentity(row: Record<string, unknown> | null): ProfileIdentity | null {
  if (!row || !row.id) {
    return null;
  }

  return {
    userId: String(row.id),
    displayId: typeof row.display_id === 'number' ? row.display_id : null,
    username: row.username ? String(row.username) : null,
    displayName: row.display_name ? String(row.display_name) : null,
    email: row.email ? String(row.email) : null,
    role: (row.role as ProfileRole | undefined) ?? null,
    avatarUrl: row.avatar_url ? String(row.avatar_url) : null,
    telegramChatId:
      row.telegram_chat_id === null || row.telegram_chat_id === undefined
        ? null
        : String(row.telegram_chat_id),
    telegramUsername: row.telegram_username ? String(row.telegram_username) : null,
    createdAt: row.created_at ? String(row.created_at) : null,
  };
}

const IDENTITY_COLUMNS =
  'id, display_id, username, display_name, email, role, avatar_url, telegram_chat_id, telegram_username, created_at';

export async function getParticipantIdentity(conversationId: string, userId: string): Promise<ProfileIdentity | null> {
  const admin = createSupabaseAdminClient();
  if (!admin) return null;
  const { data } = await admin.from('profiles').select(IDENTITY_COLUMNS).eq('id', userId).maybeSingle();
  return shapeProfileIdentity(data);
}



// The signed-in user's own identity. Backfills a missing display_id/username
// through the 0009 trigger by writing the row once; a no-op update is harmless
// because the trigger only fills nulls.
export async function getMyIdentity(userId: string): Promise<ProfileIdentity | null> {
  const supabase = await db();

  const { data, error } = await supabase
    .from('profiles')
    .select(IDENTITY_COLUMNS)
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('Error fetching own identity:', error.message);
    return null;
  }

  if (!data) {
    return null;
  }

  if (data.display_id === null || data.username === null) {
    const patched = await ensureProfileIdentity(userId);
    if (patched) {
      return patched;
    }
  }

  return shapeProfileIdentity(data);
}

// Forces the 0009 before-insert trigger to run for an existing row. `role` is
// deliberately absent from the write: this path must never be able to touch it,
// and the column-level grant from 0006 would reject it anyway.
export async function ensureProfileIdentity(userId: string): Promise<ProfileIdentity | null> {
  const supabase = await db();

  const { data, error } = await supabase
    .from('profiles')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select(IDENTITY_COLUMNS)
    .maybeSingle();

  if (error) {
    console.error('Error backfilling profile identity:', error.message);
    return null;
  }

  return shapeProfileIdentity(data);
}

// Sets the caller's own username. The RLS policy added in 0009 re-checks
// uniqueness, so a taken handle fails here rather than silently colliding.
export async function updateMyUsername(
  userId: string,
  username: string,
): Promise<{ ok: true; identity: ProfileIdentity } | { ok: false; reason: string }> {
  const supabase = await db();

  const { data, error } = await supabase
    .from('profiles')
    .update({ username, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select(IDENTITY_COLUMNS)
    .maybeSingle();

  if (error) {
    // 23505 = unique violation, i.e. the handle is taken.
    const taken = error.code === '23505' || /duplicate key|already exists/i.test(error.message);
    return {
      ok: false,
      reason: taken ? 'That username is taken.' : 'Could not update your username.',
    };
  }

  const identity = shapeProfileIdentity(data);

  if (!identity) {
    return { ok: false, reason: 'Could not update your username.' };
  }

  return { ok: true, identity };
}

export async function updateMyProfile(
  userId: string,
  fields: { display_name?: string; email?: string; avatar_url?: string | null },
): Promise<{ ok: true; identity: ProfileIdentity } | { ok: false; reason: string }> {
  const supabase = await db();

  const { data, error } = await supabase
    .from('profiles')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .select(IDENTITY_COLUMNS)
    .maybeSingle();

  if (error) {
    return { ok: false, reason: 'Could not update your profile.' };
  }

  const identity = shapeProfileIdentity(data);
  if (!identity) {
    return { ok: false, reason: 'Could not update your profile.' };
  }

  return { ok: true, identity };
}

// Links a Telegram chat to an account. Only ever called from the bot deep-link
// verifier, after the bot has confirmed the chat id belongs to the person who
// clicked the link -- never from a client-supplied chat id.
export async function linkTelegramToProfile(
  userId: string,
  chatId: string,
  telegramUsername: string | null,
): Promise<{ ok: true; identity: ProfileIdentity } | { ok: false; reason: string }> {
  const supabase = await db();

  const { data, error } = await supabase
    .from('profiles')
    .update({
      telegram_chat_id: chatId,
      telegram_username: telegramUsername,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .select(IDENTITY_COLUMNS)
    .maybeSingle();

  if (error) {
    const taken = error.code === '23505' || /duplicate key|already exists/i.test(error.message);
    return {
      ok: false,
      reason: taken
        ? 'That Telegram account is already linked elsewhere.'
        : 'Could not link Telegram.',
    };
  }

  const identity = shapeProfileIdentity(data);

  if (!identity) {
    return { ok: false, reason: 'Could not link Telegram.' };
  }

  return { ok: true, identity };
}

// Service-role list of every profile id, used by the bot's paste-code confirmation.
// The link code is stateless, so verification proves ownership by recomputing it for
// each account; if this list cannot be read, verification fails closed with zero
// candidates and no link can be made.
export async function listTelegramLinkCandidates(): Promise<string[]> {
  const supabase = createSupabaseAdminClient();

  if (!supabase) {
    return [];
  }

  const { data, error } = await supabase.from('profiles').select('id');

  if (error || !data) {
    console.error('Telegram link candidates error:', error?.message ?? 'no data');
    return [];
  }

  return data.map((row) => String((row as { id?: unknown }).id ?? '').trim()).filter(Boolean);
}

// Service-role variant of linkTelegramToProfile, for the bot link verifier.
//
// The user-scoped client cannot write this row: at the moment the bot calls back there is no
// browser session, and the profile being written belongs to whoever signed the token, not to the
// caller. Ownership is established by the token verification the route performs before it gets
// here, so this is a privileged write with the authorization already done.
//
// It also backfills a missing username from the linked Telegram handle. That is best-effort on
// purpose: the chat id is the important part, and a handle collision must not fail the link --
// the member can pick a different one in settings.
export async function linkTelegramAsVerifiedBot(
  userId: string,
  chatId: string,
  telegramUsername: string | null,
): Promise<
  { ok: true; usernameAssigned: boolean } | { ok: false; reason: 'taken' | 'unavailable' | 'failed' }
> {
  const supabase = createSupabaseAdminClient();

  if (!supabase) {
    return { ok: false, reason: 'unavailable' };
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      telegram_chat_id: chatId,
      telegram_username: telegramUsername,
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId);

  if (error) {
    // 23505 = unique violation on profiles_telegram_chat_id_key.
    const taken = error.code === '23505' || /duplicate key|already exists/i.test(error.message);
    console.error('Telegram link write error:', error.message);
    return { ok: false, reason: taken ? 'taken' : 'failed' };
  }

  if (!telegramUsername) {
    return { ok: true, usernameAssigned: false };
  }

  // A handle that is already legal but taken by someone else is simply skipped: the link stands.
  const candidate = validateUsername(telegramUsername);

  if (!candidate.ok) {
    return { ok: true, usernameAssigned: false };
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('username')
    .eq('id', userId)
    .maybeSingle();

  if (profile?.username) {
    return { ok: true, usernameAssigned: false };
  }

  const { error: usernameError } = await supabase
    .from('profiles')
    .update({ username: candidate.username, updated_at: new Date().toISOString() })
    .eq('id', userId)
    .is('username', null);

  if (usernameError) {
    console.warn('Could not auto-assign username from Telegram:', usernameError.message);
  }

  return { ok: true, usernameAssigned: !usernameError };
}

// Resolves a profile's own Telegram chat id, for notification delivery.
// Returns null when the person has never linked Telegram, which is what makes
// notifications best-effort rather than an error.
export async function getTelegramChatIdForUser(userId: string): Promise<string | null> {
  const supabase = await db();

  const { data, error } = await supabase
    .from('profiles')
    .select('telegram_chat_id')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('Error fetching telegram chat id:', error.message);
    return null;
  }

  if (data?.telegram_chat_id === null || data?.telegram_chat_id === undefined) {
    return null;
  }

  return String(data.telegram_chat_id);
}

export interface FounderNotifyTargets {
  email: string | null;
  telegramChatId: string | null;
}

// Where the conversation's owner (the founder) can be reached for
// member-facing stage notifications: their stored email plus their linked
// Telegram chat, fetched in one query. Either side may be null — unlinked
// Telegram or a missing email is a delivery miss, never an error.
export async function getFounderNotifyTargets(
  conversationId: string
): Promise<FounderNotifyTargets> {
  const empty: FounderNotifyTargets = { email: null, telegramChatId: null };
  const ownerId = await getConversationOwnerId(conversationId);
  if (!ownerId) return empty;

  const supabase = await db();
  const { data, error } = await supabase
    .from('profiles')
    .select('email, telegram_chat_id')
    .eq('id', ownerId)
    .maybeSingle();

  if (error) {
    console.error('Error fetching founder notify targets:', error.message);
    return empty;
  }

  return {
    email: data?.email ? String(data.email) : null,
    telegramChatId: data?.telegram_chat_id ? String(data.telegram_chat_id) : null,
  };
}

// Operator-facing discovery delivery targets: every linked staff member
// (profiles.role operator or admin with a Telegram chat on the profile), minus the
// conversation's own founder who wrote the brief. Staff rows are read with the
// service role because the caller is whoever triggered the transition, not a
// notify target (H7 allows the service role in this module only).
export async function getStaffTelegramTargets(excludeUserId: string | null): Promise<string[]> {
  const supabase = await readClient(true);

  let query = supabase
    .from('profiles')
    .select('id, telegram_chat_id, role')
    .in('role', ['operator', 'admin'])
    .not('telegram_chat_id', 'is', null);
  if (excludeUserId) {
    query = query.neq('id', excludeUserId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching staff telegram targets:', error.message);
    return [];
  }

  return (data ?? [])
    .map((row) => (row.telegram_chat_id === null || row.telegram_chat_id === undefined ? '' : String(row.telegram_chat_id)))
    .filter((chatId) => chatId !== '');
}

// Journey spec: a finished brief reaches the team on both channels — the Discord
// discovery embed (below) and a personal Telegram DM to every linked operator.
// Best-effort like its Discord sibling: never throws, never fails the transition.
export async function notifyStaffBriefReady(conversationId: string, title: string): Promise<void> {
  try {
    const ownerId = await getConversationOwnerId(conversationId);
    const targets = await getStaffTelegramTargets(ownerId);
    if (targets.length === 0) return;

    await Promise.all(targets.map((chatId) => notifyUser(chatId, 'brief_ready', { title })));
  } catch (error) {
    console.error('notifyStaffBriefReady failed:', error instanceof Error ? error.message : error);
  }
}

// Journey spec: operators enter a chat only through their own accepted proposal
// (admins view every chat; operators get invited by the accept). Reads go through
// the service role so a pre-join operator can check their own standing.
export async function hasAcceptedProposalFrom(conversationId: string, userId: string): Promise<boolean> {
  const supabase = await readClient(true);

  const { data, error } = await supabase
    .from('proposals')
    .select('id')
    .eq('conversation_id', conversationId)
    .eq('created_by', userId)
    .eq('status', 'accepted')
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Error checking accepted proposal:', error.message);
    return false;
  }

  return Boolean(data);
}

// Display name for system lines that name a human ("Mxstermind sent a proposal").
// Service-role read so it works in any route regardless of caller RLS visibility.
export async function getProfileDisplayName(userId: string | null | undefined): Promise<string> {
  if (!userId) return 'The team';
  const supabase = createSupabaseAdminClient();
  if (!supabase) return 'The team';

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, full_name, username, email')
    .eq('id', userId)
    .maybeSingle();

  return (
    (profile?.display_name && String(profile.display_name)) ||
    (profile?.full_name && String(profile.full_name)) ||
    (profile?.username && String(profile.username)) ||
    (profile?.email && String(profile.email).split('@')[0]) ||
    'The team'
  );
}

// Two-declines-out rule: how many of this author's proposals on this conversation the
// founder has declined. Counted service-side so the POST gate and the PATCH message
// always agree, with no new column to migrate.
export async function countDeclinedProposals(
  conversationId: string,
  authorId: string | null | undefined
): Promise<number> {
  if (!conversationId || !authorId) return 0;
  const supabase = createSupabaseAdminClient();
  if (!supabase) return 0;

  const { count, error } = await supabase
    .from('proposals')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversationId)
    .eq('created_by', authorId)
    .eq('status', 'declined');

  if (error) {
    console.error('Error counting declined proposals:', error.message);
    return 0;
  }

  return count ?? 0;
}

// The accept IS the invite: add the proposal's author (always staff, gated in
// POST /api/proposals) to the conversation as an operator with a join line the
// founder can see. Returns null when there is nothing to add.
export async function inviteProposalAuthor(proposal: {
  conversation_id: string;
  created_by?: string | null;
}): Promise<{ displayName: string; already: boolean } | null> {
  const authorId = proposal.created_by ?? null;
  if (!authorId) return null;

  const ownerId = await getConversationOwnerId(proposal.conversation_id);
  if (ownerId === authorId) return null;

  const supabase = await readClient(true);

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, full_name, username, email')
    .eq('id', authorId)
    .maybeSingle();

  const displayName =
    (profile?.display_name && String(profile.display_name)) ||
    (profile?.full_name && String(profile.full_name)) ||
    (profile?.username && String(profile.username)) ||
    (profile?.email && String(profile.email).split('@')[0]) ||
    'The team';

  const { data: existing } = await supabase
    .from('participants')
    .select('id')
    .eq('conversation_id', proposal.conversation_id)
    .eq('user_id', authorId)
    .maybeSingle();

  if (existing) {
    return { displayName, already: true };
  }

  const { error: insertError } = await supabase.from('participants').upsert(
    {
      conversation_id: proposal.conversation_id,
      user_id: authorId,
      role: 'operator',
      display_name: displayName,
    },
    { onConflict: 'conversation_id,user_id', ignoreDuplicates: true }
  );

  if (insertError) {
    console.error('inviteProposalAuthor:', insertError.message);
    return null;
  }

  await addMessage({
    conversation_id: proposal.conversation_id,
    sender_type: 'ai',
    sender_name: 'BrandForge',
    content: `${displayName} joined this conversation (their proposal was accepted).`,
    content_type: 'system',
  });

  return { displayName, already: false };
}

// Some reads must work for BrandForge staff even though row level security only grants them
// conversations, messages, project_context and tasks. Staff (profiles.role operator/admin) read
// the founder-scoped tables - requirements, milestones, proposals, agreements, payments,
// participants - with the service role so the team sees the real chat history. Everyone else keeps
// the signed-in client, and a missing service key simply falls back to it.
async function readClient(asStaff?: boolean): Promise<ProjectDbClient> {
  if (asStaff) {
    const admin = createSupabaseAdminClient();

    if (admin) {
      // The service-role client is API-compatible; the cast only satisfies the generated types.
      return admin as unknown as ProjectDbClient;
    }
  }

  return db();
}

// Call one of the 0014/0015 RPCs as the signed-in caller (db(), RLS enforced).
// If the session client is missing EXECUTE (migration 0016_grant_rpc_execute.sql
// not applied yet, or grants drifted), Postgres answers 42501 — bridge the same
// call through the service role, which the route has already authorized (the
// getFunnelSummary pattern), and log loudly so the grant gap never hides.
async function rpcForCaller(name: string, args: Record<string, unknown>) {
  const supabase = await db();
  const result = await supabase.rpc(name, args);
  if (!result.error || (result.error as { code?: string }).code !== '42501') {
    return result;
  }

  console.warn(
    `[rpc] ${name}: permission denied for the session client — bridging via service role (apply migration 0016_grant_rpc_execute.sql)`
  );
  const admin = createSupabaseAdminClient();
  if (!admin) return result;
  return (await admin.rpc(name, args)) as typeof result;
}

// ---------- Project context ----------

export async function getProjectContext(conversationId: string): Promise<ProjectContext | null> {
  const supabase = await db();

  const { data, error } = await supabase
    .from('project_context')
    .select('*')
    .eq('conversation_id', conversationId)
    .maybeSingle();

  if (error) {
    console.error('Error fetching project context:', error.message);
    return null;
  }

  return data ?? null;
}

export async function upsertProjectContext(context: ProjectContext): Promise<ProjectContext | null> {
  const supabase = await db();

  const { data, error } = await supabase
    .from('project_context')
    .upsert(
      {
        ...context,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'conversation_id' }
    )
    .select()
    .maybeSingle();

  if (error) {
    console.error('Error upserting project context:', error.message);
    return null;
  }

  return data ?? null;
}

export async function updateProjectContext(
  conversationId: string,
  updates: Partial<ProjectContext>
): Promise<ProjectContext | null> {
  const existing = await getProjectContext(conversationId);

  if (!existing) {
    return upsertProjectContext({
      conversation_id: conversationId,
      ...updates,
    });
  }

  const supabase = await db();

  const { data, error } = await supabase
    .from('project_context')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('conversation_id', conversationId)
    .select()
    .maybeSingle();

  if (error) {
    console.error('Error updating project context:', error.message);
    return null;
  }

  return data ?? null;
}

// ---------- Requirements ----------

export async function addRequirement(requirement: Requirement): Promise<Requirement | null> {
  const supabase = await db();

  const { data, error } = await supabase
    .from('requirements')
    .insert(requirement)
    .select()
    .maybeSingle();

  if (error) {
    console.error('Error adding requirement:', error.message);
    return null;
  }

  await syncRequirementCounts(requirement.conversation_id);

  return data ?? null;
}

export async function addRequirements(requirements: Requirement[]): Promise<Requirement[]> {
  if (!Array.isArray(requirements) || requirements.length === 0) {
    return [];
  }

  const supabase = await db();

  const { data, error } = await supabase
    .from('requirements')
    .insert(requirements)
    .select();

  if (error) {
    console.error('Error adding requirements:', error.message);
    return [];
  }

  await syncRequirementCounts(requirements[0].conversation_id);

  return data ?? [];
}

export async function updateRequirementStatus(
  requirementId: string,
  status: Requirement['status']
): Promise<Requirement | null> {
  const supabase = await db();

  const { data, error } = await supabase
    .from('requirements')
    .update({ status })
    .eq('id', requirementId)
    .select()
    .maybeSingle();

  if (error) {
    console.error('Error updating requirement status:', error.message);
    return null;
  }

  if (data?.conversation_id) {
    await syncRequirementCounts(data.conversation_id);
  }

  return data ?? null;
}

export async function getRequirements(
  conversationId: string,
  asStaff?: boolean
): Promise<Requirement[]> {
  const supabase = await readClient(asStaff);

  const { data, error } = await supabase
    .from('requirements')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching requirements:', error.message);
    return [];
  }

  return data ?? [];
}

export async function getOpenQuestions(conversationId: string): Promise<Requirement[]> {
  const requirements = await getRequirements(conversationId);

  return requirements.filter(
    (requirement) =>
      requirement.category === 'open_question' &&
      requirement.status !== 'resolved' &&
      requirement.status !== 'rejected'
  );
}

export async function addOpenQuestion(question: {
  conversation_id: string;
  title: string;
  description?: string | null;
  priority?: Requirement['priority'];
}): Promise<Requirement | null> {
  return addRequirement({
    conversation_id: question.conversation_id,
    category: 'open_question',
    title: question.title,
    description: question.description ?? null,
    priority: question.priority ?? 'medium',
    status: 'open',
  });
}

export async function resolveOpenQuestion(
  requirementId: string,
  resolution?: string
): Promise<Requirement | null> {
  const supabase = await db();

  const { data: existing, error: readError } = await supabase
    .from('requirements')
    .select('id, description')
    .eq('id', requirementId)
    .maybeSingle();

  if (readError || !existing) {
    console.error('Error reading open question:', readError?.message ?? 'not found');
    return null;
  }

  const description = resolution?.trim()
    ? `${existing.description ? `${existing.description}\n\n` : ''}Resolved: ${resolution.trim()}`
    : existing.description ?? null;

  return updateRequirementStatusAndDescription(requirementId, 'resolved', description);
}

async function updateRequirementStatusAndDescription(
  requirementId: string,
  status: Requirement['status'],
  description: string | null
): Promise<Requirement | null> {
  const supabase = await db();

  const { data, error } = await supabase
    .from('requirements')
    .update({ status, description })
    .eq('id', requirementId)
    .select()
    .maybeSingle();

  if (error) {
    console.error('Error updating requirement:', error.message);
    return null;
  }

  if (data?.conversation_id) {
    await syncRequirementCounts(data.conversation_id);
  }

  return data ?? null;
}

// Requirement counters are recomputed from the rows themselves so the sidebar can never
// drift from what is actually stored.
export async function syncRequirementCounts(conversationId: string): Promise<void> {
  const requirements = await getRequirements(conversationId);

  const captured = requirements.filter(
    (requirement) => requirement.category !== 'open_question' && requirement.status !== 'rejected'
  );
  const openQuestions = requirements.filter(
    (requirement) =>
      requirement.category === 'open_question' &&
      requirement.status !== 'resolved' &&
      requirement.status !== 'rejected'
  );

  await updateProjectContext(conversationId, {
    requirements_count: captured.length,
    open_questions_count: openQuestions.length,
  });
}

// ---------- Decisions ----------

export async function recordDecision(decision: Decision): Promise<Decision | null> {
  const supabase = await db();

  const { data, error } = await supabase
    .from('decisions')
    .insert(decision)
    .select()
    .maybeSingle();

  if (error) {
    console.error('Error recording decision:', error.message);
    return null;
  }

  return data ?? null;
}

export async function getDecisions(conversationId: string): Promise<Decision[]> {
  const supabase = await db();

  const { data, error } = await supabase
    .from('decisions')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching decisions:', error.message);
    return [];
  }

  return data ?? [];
}

// ---------- Conversations ----------

export async function createConversation(
  userId: string | null,
  title: string = 'New Project'
): Promise<string | null> {
  const supabase = await db();

  const { data, error } = await supabase
    .from('conversations')
    .insert({
      user_id: userId,
      title,
      status: 'DISCOVERY',
    })
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('Error creating conversation:', error.message);
    return null;
  }

  return data?.id ?? null;
}

export async function getConversation(conversationId: string) {
  const supabase = await db();

  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('id', conversationId)
    .maybeSingle();

  if (error) {
    console.error('Error fetching conversation:', error.message);
    return null;
  }

  return data ?? null;
}

export async function getConversationForUser(userId: string, conversationId: string) {
  const supabase = await db();

  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('id', conversationId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('Error fetching founder conversation:', error.message);
    return null;
  }

  return data ?? null;
}

export async function updateConversationStatus(
  conversationId: string,
  status: string
): Promise<boolean> {
  const runUpdate = async (client: SupabaseClient) =>
    client
      .from('conversations')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', conversationId)
      .or(`status.is.null,status.neq.${status}`)
      .select('id, title')
      .maybeSingle();

  // Only a real transition writes: the or() filter matches rows that are not
  // already in the target state (a null status counts as "somewhere else"), and
  // select() hands the row back so the discovery notifier can name the project.
  // Repeated tool calls and idempotent retries update nothing and notify nobody.
  let result = await runUpdate(await db());

  // Two denial shapes: a denied INSERT raises 42501, but RLS on UPDATE just filters the
  // row out — PostgREST answers "0 rows" with no error at all. The or() filter matches
  // any existing row that is not already in the target state, so an empty result means
  // either an idempotent retry (row already there) or the session has no UPDATE policy —
  // an operator moving their own proposal to PROPOSED hits exactly that. Probe the row
  // and bridge the write through the service role when it is a real denial (the route
  // already authorized the caller; same contract as rpcForCaller).
  if (result.error ? result.error.code === '42501' : result.data === null) {
    const { data: current } = await (await db())
      .from('conversations')
      .select('status')
      .eq('id', conversationId)
      .maybeSingle();

    if (!result.error && current?.status === status) {
      // Idempotent retry: the row already sits in the target state. Update nothing.
      return true;
    }

    console.warn(
      `[status] ${conversationId}: session client could not update the row (status=${status}) — bridging via service role`
    );
    const admin = createSupabaseAdminClient();
    if (!admin) {
      console.error('Error updating conversation status: service role client not configured');
      return false;
    }
    result = await runUpdate(admin);
  }

  const { data, error } = result;

  if (error) {
    console.error('Error updating conversation status:', error.message);
    return false;
  }

  // Journey gap #5: arrival at READY_FOR_REVIEW is the moment specialists must
  // see — post once into the Discord discovery channel, and DM every linked
  // operator on Telegram (best-effort, never fails the caller; both fire only
  // when the row actually transitioned). The ops event layer mirrors the moment
  // into the staff briefs channel plus one anonymized public line.
  if (data && status === 'READY_FOR_REVIEW') {
    await notifyDiscordDiscovery(conversationId, data.title);
    await notifyStaffBriefReady(conversationId, data.title);
    await postOpsEvent('brief_posted', { title: data.title, conversationId });
    await postPublicActivity('brief_posted');
  }

  return true;
}

export async function updateConversationTitle(
  conversationId: string,
  title: string
): Promise<boolean> {
  const trimmed = String(title ?? '').trim();
  if (!trimmed) {
    return false;
  }

  const supabase = await db();

  const { error } = await supabase
    .from('conversations')
    .update({ title: trimmed, updated_at: new Date().toISOString() })
    .eq('id', conversationId);

  if (error) {
    console.error('Error updating conversation title:', error.message);
    return false;
  }

  return true;
}

export async function getUserConversations(userId: string) {
  const supabase = await db();

  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('Error fetching user conversations:', error.message);
    return [];
  }

  return data ?? [];
}

// Recents must reflect real persisted conversations only: a chat with zero messages has
// not become a project yet, so it is never listed.
// One query does the heavy lifting: get_conversation_summaries (migration 0015) returns
// up to 50 scoped conversations with message counts, previews, project names and first
// staff presence. This side only presents — title fallbacks, truncation, the staff-name
// fallback — and sorts by last activity, exactly like before.
async function buildConversationSummaries(userId?: string): Promise<ConversationSummary[]> {
  const { data, error } = await rpcForCaller('get_conversation_summaries', {
    p_user_id: userId ?? null,
  });

  if (error) {
    console.error('Error fetching conversation summaries:', error.message);
    return [];
  }

  const summaries: ConversationSummary[] = [];

  for (const row of data ?? []) {
    const storedTitle = String(row.title ?? '').trim();
    const title =
      (row.project_name ? String(row.project_name).trim() : '') ||
      (storedTitle && storedTitle !== 'New Project' ? storedTitle : '') ||
      truncate(row.first_user_content ?? storedTitle, 60) ||
      'New conversation';
    const staffViewedBy = row.staff_name
      ? String(row.staff_name).trim() || 'Specialist'
      : null;

    summaries.push({
      id: row.id,
      title,
      status: row.status ?? 'DISCOVERY',
      messageCount: Number(row.message_count),
      lastActivity: row.last_activity ?? null,
      preview: truncate(row.last_content ?? '', 90) || null,
      ownerId: String(row.user_id ?? ''),
      staffViewedAt: row.staff_joined_at || null,
      staffViewedBy,
      isUnseen: row.staff_joined_at == null,
    });
  }

  return summaries.sort((a, b) =>
    String(b.lastActivity ?? '').localeCompare(String(a.lastActivity ?? ''))
  );
}

export async function getUserConversationSummaries(userId: string): Promise<ConversationSummary[]> {
  return buildConversationSummaries(userId);
}

// Staff inbox: an allowlisted operator sees every founder conversation, not only the ones they
// created. Row level security still decides what "every" means for the signed-in account.
export async function getStaffConversationSummaries(): Promise<ConversationSummary[]> {
  return buildConversationSummaries();
}

function truncate(value: string | null | undefined, maxLength: number): string {
  const trimmed = String(value ?? '').replace(/\s+/g, ' ').trim();

  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength - 1)}…`;
}

export async function countMessages(conversationId: string): Promise<number> {
  const supabase = await db();

  const { count, error } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversationId);

  if (error) {
    console.error('Error counting messages:', error.message);
    return 0;
  }

  return count ?? 0;
}

// ---------- Messages ----------

export async function uploadConversationAttachment(
  conversationId: string,
  userId: string,
  file: File
): Promise<{ path: string; name: string; size: number; contentType: string } | null> {
  const admin = createSupabaseAdminClient();
  if (!admin) return null;
  const safeName = safeDownloadName(file.name) || 'attachment';
  const path = `conversation-${conversationId}/${userId}/${crypto.randomUUID()}-${safeName}`;
  const { error } = await admin.storage.from('conversation-attachments').upload(path, file, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  });
  if (error) { console.error('Error uploading conversation attachment:', error.message); return null; }
  return { path, name: file.name.slice(0, 120), size: file.size, contentType: file.type || 'application/octet-stream' };
}

export async function removeConversationAttachment(path: string): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  if (!admin) return false;
  const { error } = await admin.storage.from('conversation-attachments').remove([path]);
  return !error;
}

export async function downloadConversationAttachment(path: string) {
  const admin = createSupabaseAdminClient();
  if (!admin) return null;
  const { data, error } = await admin.storage.from('conversation-attachments').download(path);
  if (error) return null;
  return data;
}

export async function getPendingAiDrafts(conversationId: string) {
  const admin = createSupabaseAdminClient();
  if (!admin) return [];
  const { data } = await admin
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .eq('content_type', 'ai_draft')
    .is('deleted_at', null)
    .order('created_at', { ascending: true });
  return data ?? [];
}

export async function resolveAiDraft(
  messageId: string,
  staffId: string,
  staffName: string,
  action: 'approve' | 'reject',
  conversationId: string
): Promise<'approved' | 'rejected' | 'not_found'> {
  const admin = createSupabaseAdminClient();
  if (!admin) return 'not_found';
  const { data: draft } = await admin
    .from('messages')
    .select('id,content_type,deleted_at,conversation_id')
    .eq('id', messageId)
    .eq('conversation_id', conversationId)
    .maybeSingle();
  if (!draft || draft.content_type !== 'ai_draft' || draft.deleted_at) return 'not_found';
  if (action === 'reject') {
    const { error } = await admin.from('messages').update({ deleted_at: new Date().toISOString() }).eq('id', messageId);
    return error ? 'not_found' : 'rejected';
  }
  const { error } = await admin
    .from('messages')
    .update({
      sender_type: 'human_operator',
      sender_id: staffId,
      sender_name: staffName,
      content_type: 'text',
      artifact_data: { source: 'ai', approved_by: staffId, approved_at: new Date().toISOString() },
    })
    .eq('id', messageId);
  return error ? 'not_found' : 'approved';
}
export async function addMessage(message: {
  conversation_id: string;
  sender_type: 'user' | 'ai' | 'human_operator' | 'human_builder';
  sender_id?: string | null;
  sender_name?: string | null;
  content: string;
  content_type?: string;
  artifact_data?: Record<string, unknown> | null;
}): Promise<string | null> {
  const runInsert = async (client: SupabaseClient) =>
    client
      .from('messages')
      .insert(message)
      .select('id')
      .maybeSingle();

  let result = await runInsert(await db());

  // Product-authored receipts must land even when the caller has no INSERT policy: an
  // operator sending a proposal is not yet a participant, so the proposal card would
  // silently vanish. Human chat never bridges — routes gate humans and RLS stays the
  // authority for anything a person typed.
  if (result.error && result.error.code === '42501' && message.content_type === 'system') {
    console.warn(
      `[message] system receipt for ${message.conversation_id}: session client denied insert — bridging via service role`
    );
    const admin = createSupabaseAdminClient();
    if (!admin) {
      console.error('Error adding message: service role client not configured');
      return null;
    }
    result = await runInsert(admin);
  }

  const { data, error } = result;

  if (error) {
    console.error('Error adding message:', error.message);
    return null;
  }

  return data?.id ?? null;
}

export async function getMessages(
  conversationId: string,
  options?: {
    limit?: number;
    includeDeleted?: boolean;
    viewerId?: string;
    before?: string;
    excludeAiDrafts?: boolean;
  }
): Promise<ConversationMessage[]> {
  const supabase = await db();
  const limit = options?.limit;
  const includeDeleted = options?.includeDeleted ?? false;
  const viewerId = options?.viewerId;
  const before = options?.before;
  const excludeAiDrafts = options?.excludeAiDrafts ?? false;

  // With a limit we read the newest rows descending and flip them back to
  // chronological order; without one the original ascending read is kept.
  const paged = typeof limit === 'number' && limit > 0;
  const ascending = !paged;

  let query = supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId);

  if (!includeDeleted) query = query.is('deleted_at', null);
  if (excludeAiDrafts) query = query.neq('content_type', 'ai_draft');
  if (before) query = query.lt('created_at', before);

  query = query.order('created_at', { ascending });
  if (paged && typeof limit === 'number') query = query.limit(limit);

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching messages:', error.message);
    return [];
  }

  const messages = ((data ?? []) as ConversationMessage[]).slice();
  const rows = ascending ? messages : messages.reverse();
  if (rows.length === 0 || !viewerId) return rows;

  const messageIds = rows.map((message) => message.id);
  const { data: reactionRows, error: reactionError } = await supabase
    .from('message_reactions')
    .select('message_id,user_id,emoji')
    .in('message_id', messageIds);

  if (reactionError) {
    console.error('Error fetching message reactions:', reactionError.message);
    return rows;
  }

  const grouped = new Map<string, Map<string, { count: number; userIds: Set<string> }>>();
  for (const row of (reactionRows ?? []) as { message_id: string; user_id: string; emoji: string }[]) {
    const emojis = grouped.get(row.message_id) ?? new Map();
    const reaction = emojis.get(row.emoji) ?? { count: 0, userIds: new Set<string>() };
    reaction.count += 1;
    reaction.userIds.add(row.user_id);
    emojis.set(row.emoji, reaction);
    grouped.set(row.message_id, emojis);
  }

  // Counts come from message_reactions; reactedByMe is computed from the viewer's own rows.
  return rows.map((message) => ({
    ...message,
    reactions: [...(grouped.get(message.id) ?? new Map())].map(([emoji, reaction]) => ({
      emoji,
      count: reaction.count,
      reactedByMe: reaction.userIds.has(viewerId),
    })),
  }));
}

// Rich-message mutations run with the service role only after the route verifies that the
// authenticated user is the original sender. Keeping every privileged write in this allow-listed
// module prevents the browser client from ever receiving a service-role key.
export async function mutateOwnedMessage(
  messageId: string,
  userId: string,
  action: 'edit' | 'delete',
  value?: string
): Promise<'updated' | 'deleted' | 'not_found' | 'forbidden'> {
  const admin = createSupabaseAdminClient();
  if (!admin) return 'not_found';

  const { data: message, error: readError } = await admin
    .from('messages')
    .select('id,sender_id,sender_type,content_type,deleted_at')
    .eq('id', messageId)
    .maybeSingle();
  if (readError || !message) return 'not_found';
  if (message.sender_id !== userId || message.sender_type === 'ai' || message.content_type === 'system' || message.deleted_at) {
    return 'forbidden';
  }

  if (action === 'delete') {
    const { error } = await admin
      .from('messages')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', messageId)
      .eq('sender_id', userId);
    return error ? 'not_found' : 'deleted';
  }

  const { error } = await admin
    .from('messages')
    .update({ content: value ?? '', edited_at: new Date().toISOString() })
    .eq('id', messageId)
    .eq('sender_id', userId);
  return error ? 'not_found' : 'updated';
}

export async function toggleMessageReaction(
  messageId: string,
  conversationId: string,
  userId: string,
  emoji: string
): Promise<'added' | 'removed' | 'not_found' | 'forbidden'> {
  const admin = createSupabaseAdminClient();
  if (!admin) return 'not_found';
  const { data: message } = await admin
    .from('messages')
    .select('id,conversation_id,deleted_at')
    .eq('id', messageId)
    .eq('conversation_id', conversationId)
    .maybeSingle();
  if (!message || message.deleted_at) return 'not_found';

  const { data: existing, error: readError } = await admin
    .from('message_reactions')
    .select('id')
    .eq('message_id', messageId)
    .eq('user_id', userId)
    .eq('emoji', emoji)
    .maybeSingle();
  if (readError) return 'not_found';
  if (existing) {
    const { error } = await admin.from('message_reactions').delete().eq('id', existing.id);
    return error ? 'not_found' : 'removed';
  }
  const { error } = await admin.from('message_reactions').insert({ message_id: messageId, user_id: userId, emoji });
  return error ? 'not_found' : 'added';
}

export async function getAllConversations() {
  const supabase = await db();

  const { data, error } = await supabase
    .from('conversations')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(10);

  if (error) {
    console.error('Error fetching conversations:', error.message);
    return [];
  }

  return data ?? [];
}

// Authorization helper: check if a user can access a conversation.
// RLS already scopes rows to the founder, so a row that comes back belongs to them (or to
// a conversation they were added to as a participant).
export async function canAccessConversation(
  userId: string,
  conversationId: string,
  options: { allowStaff?: boolean } = {}
): Promise<boolean> {
  const supabase = await db();

  const { data: conversation, error } = await supabase
    .from('conversations')
    .select('user_id')
    .eq('id', conversationId)
    .maybeSingle();

  if (error) {
    console.error('Error checking conversation access:', error.message);
    return false;
  }

  if (!conversation) {
    return false;
  }

  if (conversation.user_id === userId) {
    return true;
  }

  // BrandForge staff read every founded chat. That is the point of the staff rail: the team sees
  // the history first and only then decides to enter it, so access cannot depend on having joined.
  if (options.allowStaff && (await isStaffAccount(userId))) {
    return true;
  }

  const { data: participant } = await supabase
    .from('participants')
    .select('id')
    .eq('conversation_id', conversationId)
    .eq('user_id', userId)
    .maybeSingle();

  return Boolean(participant);
}

// Identity lookup for route-level authorization on the money path. Runs as the service role so
// the answer does not depend on the caller's own RLS visibility.
export async function getConversationOwnerId(conversationId: string): Promise<string | null> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error('Error loading conversation owner: service role client not configured');
    return null;
  }

  const { data, error } = await supabase
    .from('conversations')
    .select('user_id')
    .eq('id', conversationId)
    .maybeSingle();

  if (error) {
    console.error('Error loading conversation owner:', error.message);
    return null;
  }

  return data?.user_id ?? null;
}

// ---------- Proposals ----------

export async function createProposal(proposal: {
  conversation_id: string;
  title: string;
  scope?: string;
  deliverables?: Record<string, unknown>;
  total_amount: number;
  currency?: string;
  estimated_weeks_min?: number;
  estimated_weeks_max?: number;
  created_by?: string;
}) {
  // Proposals are issued by staff only; the route authorizes the caller and this write runs as
  // the service role, because RLS on the money tables is read-only for authenticated users.
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error('Error creating proposal: service role client not configured');
    return null;
  }

  const { data, error } = await supabase
    .from('proposals')
    .insert(proposal)
    .select()
    .maybeSingle();

  if (error) {
    console.error('Error creating proposal:', error.message);
    return null;
  }

  return data ?? null;
}

// Route-level authorization needs the row before it is written, so this reads as the service
// role regardless of caller visibility.
export async function getProposalById(proposalId: string) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error('Error fetching proposal: service role client not configured');
    return null;
  }

  const { data, error } = await supabase
    .from('proposals')
    .select('*')
    .eq('id', proposalId)
    .maybeSingle();

  if (error) {
    console.error('Error fetching proposal:', error.message);
    return null;
  }

  return data ?? null;
}

export type ProposalCounter = {
  totalAmount: number;
  weeksMin: number;
  weeksMax: number;
  note?: string | null;
};

export async function updateProposalStatus(
  proposalId: string,
  status:
    | 'pending'
    | 'changes_requested'
    | 'accepted'
    | 'declined'
    | 'expired'
    | 'countered'
    | 'counter_back',
  counter?: ProposalCounter
) {
  // Runs as the service role after the route has authorized the caller (founder or staff).
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error('Error updating proposal status: service role client not configured');
    return null;
  }

  // The row itself decides two things we cannot know up front: whether an outstanding
  // counter must be promoted into the deal terms on acceptance, and which round we are in.
  // A failed read (for instance migration 0017 not applied yet) never blocks the status
  // update itself: without it acceptance simply keeps the original offer terms.
  const { data: current, error: readError } = await supabase
    .from('proposals')
    .select('status, counter_total_amount, counter_weeks_min, counter_weeks_max, counter_round')
    .eq('id', proposalId)
    .maybeSingle();

  if (readError) {
    console.error('Error reading proposal for update (continuing without counter terms):', readError.message);
  }

  const patch: Record<string, unknown> = { status };

  if (status === 'accepted') {
    patch.accepted_at = new Date().toISOString();
    // Promote the counter the two sides just agreed on: the agreement total, escrow
    // schedule and funnel must price the final deal, not the original opening offer.
    if (current && (current.counter_round ?? 0) >= 1 && current.counter_total_amount) {
      patch.total_amount = current.counter_total_amount;
      patch.estimated_weeks_min = current.counter_weeks_min;
      patch.estimated_weeks_max = current.counter_weeks_max;
    }
  }

  if ((status === 'countered' || status === 'counter_back') && counter) {
    patch.counter_total_amount = counter.totalAmount;
    patch.counter_weeks_min = counter.weeksMin;
    patch.counter_weeks_max = counter.weeksMax;
    if (counter.note !== undefined && counter.note !== null) patch.counter_note = counter.note;
    patch.counter_round = status === 'countered' ? 1 : 2;
  }

  const { data, error } = await supabase
    .from('proposals')
    .update(patch)
    .eq('id', proposalId)
    .select()
    .maybeSingle();

  if (error) {
    console.error('Error updating proposal status:', error.message);
    return null;
  }

  return data ?? null;
}

export async function getProposal(conversationId: string, asStaff?: boolean) {
  const supabase = await readClient(asStaff);

  const { data, error } = await supabase
    .from('proposals')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Error fetching proposal:', error.message);
    return null;
  }

  return data ?? null;
}

// ---------- Milestones ----------

export async function getMilestones(
  conversationId: string,
  asStaff?: boolean
): Promise<Milestone[]> {
  const all = await getConversationMilestones(conversationId, asStaff);

  // Superseded AI drafts stay in the table for history but are never shown.
  return all.filter((milestone) => (milestone.status ?? 'pending') !== 'cancelled');
}

export async function getConversationMilestones(
  conversationId: string,
  asStaff?: boolean
): Promise<Milestone[]> {
  const supabase = await readClient(asStaff);

  const { data, error } = await supabase
    .from('milestones')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('sequence', { ascending: true });

  if (error) {
    console.error('Error fetching milestones:', error.message);
    return [];
  }

  return data ?? [];
}

export async function createMilestone(milestone: Milestone): Promise<Milestone | null> {
  const supabase = await db();

  const { data, error } = await supabase
    .from('milestones')
    .insert({
      status: 'pending',
      currency: 'EUR',
      ...milestone,
    })
    .select()
    .maybeSingle();

  if (error) {
    console.error('Error creating milestone:', error.message);
    return null;
  }

  return data ?? null;
}

// AI-suggested milestones are drafts: each pass rewrites them in place instead of deleting,
// because the founder's own RLS policies allow insert and update (not delete). Superseded
// drafts are marked 'cancelled' so history stays intact and nothing is ever duplicated —
// and the whole rewrite runs atomically in the database (see below).
export async function replaceDraftMilestones(
  conversationId: string,
  milestones: {
    title: string;
    description?: string | null;
    amount?: number | null;
    estimated_weeks?: number | null;
  }[]
): Promise<Milestone[]> {
  const rows = milestones
    .map((milestone, index) => ({
      sequence: index + 1,
      title: String(milestone.title ?? '').trim(),
      description: milestone.description ?? null,
      amount: milestone.amount ?? null,
      estimated_weeks: milestone.estimated_weeks ?? null,
    }))
    .filter((row) => row.title.length > 0);

  if (rows.length === 0) {
    return [];
  }

  // The rewrite itself is one transaction in Postgres
  // (replace_draft_milestones, migration 0014): read, reuse, insert and retire
  // happen behind a conversation lock, so two concurrent AI passes serialize
  // instead of duplicating rows. All-or-nothing — on failure nothing was
  // written, so report the empty result the tool already understands.
  try {
    const { error } = await rpcForCaller('replace_draft_milestones', {
      p_conversation_id: conversationId,
      p_rows: rows,
    });
    if (error) {
      console.error('Error replacing draft milestones:', error.message);
      return [];
    }
  } catch (cause) {
    console.error(
      'Error replacing draft milestones:',
      cause instanceof Error ? cause.message : cause
    );
    return [];
  }

  return getMilestones(conversationId);
}

// ---------- Agreements ----------

export async function createAgreement(agreement: {
  conversation_id: string;
  proposal_id: string;
  terms: string;
  total_amount: number;
  currency?: string;
}) {
  // Runs as the service role after the route has authorized the caller (the founder).
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error('Error creating agreement: service role client not configured');
    return null;
  }

  const { data, error } = await supabase
    .from('agreements')
    .insert(agreement)
    .select()
    .maybeSingle();

  if (error) {
    console.error('Error creating agreement:', error.message);
    return null;
  }

  return data ?? null;
}

export async function updateAgreementStatus(
  agreementId: string,
  status: 'pending_funding' | 'funded' | 'active' | 'completed' | 'cancelled'
) {
  // Runs as the service role after the route has authorized the caller (staff only).
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error('Error updating agreement status: service role client not configured');
    return null;
  }

  const { data, error } = await supabase
    .from('agreements')
    .update({
      status,
      ...(status === 'funded' ? { funded_at: new Date().toISOString() } : {}),
    })
    .eq('id', agreementId)
    .select()
    .maybeSingle();

  if (error) {
    console.error('Error updating agreement status:', error.message);
    return null;
  }

  return data ?? null;
}

// Contract signature (chat card). Both sides edit the terms and accept; the accept columns
// ARE the signature, so they live on the agreement row (survives message deletion) and any
// terms revision clears BOTH accepts — the signed text must be what each side last saw.
export async function updateAgreementTerms(agreementId: string, terms: string, editorId: string) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error('Error updating agreement terms: service role client not configured');
    return null;
  }

  const { data, error } = await supabase
    .from('agreements')
    .update({
      terms,
      terms_updated_at: new Date().toISOString(),
      terms_updated_by: editorId,
      founder_accepted_at: null,
      team_accepted_at: null,
    })
    .eq('id', agreementId)
    .select()
    .maybeSingle();

  if (error) {
    console.error('Error updating agreement terms:', error.message);
    return null;
  }

  return data ?? null;
}

// One side's signature. The `.is(column, null)` filter makes a double-click race harmless:
// the second write matches zero rows and the existing accept is returned unchanged.
export async function acceptAgreement(agreementId: string, side: 'founder' | 'team') {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error('Error accepting agreement: service role client not configured');
    return null;
  }

  const column = side === 'founder' ? 'founder_accepted_at' : 'team_accepted_at';
  const { data, error } = await supabase
    .from('agreements')
    .update({ [column]: new Date().toISOString() })
    .eq('id', agreementId)
    .is(column, null)
    .select()
    .maybeSingle();

  if (error) {
    console.error('Error accepting agreement:', error.message);
    return null;
  }

  if (data) return data;

  // Zero rows updated: either the row is gone or this side already signed — return current state.
  return getAgreementById(agreementId);
}

// Route-level authorization needs the row before it is written, so this reads as the service
// role regardless of caller visibility.
export async function getAgreementById(agreementId: string) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error('Error fetching agreement: service role client not configured');
    return null;
  }

  const { data, error } = await supabase
    .from('agreements')
    .select('*')
    .eq('id', agreementId)
    .maybeSingle();

  if (error) {
    console.error('Error fetching agreement:', error.message);
    return null;
  }

  return data ?? null;
}

export async function getAgreement(conversationId: string, asStaff?: boolean) {
  const supabase = await readClient(asStaff);

  const { data, error } = await supabase
    .from('agreements')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('Error fetching agreement:', error.message);
    return null;
  }

  return data ?? null;
}

// ---------- Payments ----------

export async function createPayments(agreementId: string, milestones: Milestone[]) {
  if (!milestones || milestones.length === 0) {
    return [];
  }

  // Runs as the service role: payment rows are created by the agreement-accept route after it
  // has authorized the founder.
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error('Error creating payments: service role client not configured');
    return [];
  }

  const payments = milestones.map((milestone, index) => ({
    agreement_id: agreementId,
    conversation_id: milestone.conversation_id,
    milestone_id: milestone.id,
    sequence: index + 1,
    title: milestone.title,
    amount: milestone.amount ?? 0,
    currency: milestone.currency || 'EUR',
    status: 'scheduled',
  }));

  const { data, error } = await supabase.from('payments').insert(payments).select();

  if (error) {
    console.error('Error creating payments:', error.message);
    return [];
  }

  return data ?? [];
}

export async function getPayments(conversationId: string, asStaff?: boolean) {
  const supabase = await readClient(asStaff);

  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('sequence', { ascending: true });

  if (error) {
    console.error('Error fetching payments:', error.message);
    return [];
  }

  return data ?? [];
}

// ---------- Admin-verified crypto escrow ----------
//
// Money moves in crypto, verified by hand: the client sends the full agreement total to the
// BrandForge deposit wallet and pastes the transaction hash; staff confirm the transfer
// on-chain, which marks the agreement funded; staff release each milestone payment after the
// founder approves the delivered work. Every write here runs as the service role after the
// route has authorized the caller.

// Founder submitted a transaction hash for the full agreement total. Every still-scheduled
// payment moves to 'pending' with the evidence attached. Returns false when nothing was
// updated (already submitted, or no payment rows exist for the agreement).
export async function submitAgreementFunding(
  agreementId: string,
  txHash: string,
  network: string | null
): Promise<boolean> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error('Error recording funding submission: service role client not configured');
    return false;
  }

  const { data, error } = await supabase
    .from('payments')
    .update({
      status: 'pending',
      tx_hash: txHash,
      network,
      submitted_at: new Date().toISOString(),
    })
    .eq('agreement_id', agreementId)
    .eq('status', 'scheduled')
    .select('id');

  if (error) {
    console.error('Error recording funding submission:', error.message);
    return false;
  }

  return (data?.length ?? 0) > 0;
}

// Staff confirmed the transfer on-chain: pending payments become 'paid' (held), the agreement
// becomes 'funded' and the conversation moves to ACTIVE delivery. Returns the context the
// route needs for the system message, or null on failure.
export async function verifyAgreementFunding(agreementId: string): Promise<{
  conversationId: string;
  totalAmount: number;
  currency: string;
} | null> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error('Error verifying funding: service role client not configured');
    return null;
  }

  const { data: agreement, error: agreementError } = await supabase
    .from('agreements')
    .select('conversation_id, total_amount, currency')
    .eq('id', agreementId)
    .maybeSingle();

  if (agreementError || !agreement) {
    console.error('Error verifying funding:', agreementError?.message ?? 'agreement not found');
    return null;
  }

  const { error: paymentsError } = await supabase
    .from('payments')
    .update({ status: 'paid' })
    .eq('agreement_id', agreementId)
    .eq('status', 'pending');

  if (paymentsError) {
    console.error('Error marking payments paid:', paymentsError.message);
    return null;
  }

  const funded = await updateAgreementStatus(agreementId, 'funded');
  if (!funded) {
    return null;
  }

  const { error: conversationError } = await supabase
    .from('conversations')
    .update({ status: 'ACTIVE' })
    .eq('id', agreement.conversation_id);

  if (conversationError) {
    console.error('Error activating conversation:', conversationError.message);
    return null;
  }

  return {
    conversationId: agreement.conversation_id,
    totalAmount: agreement.total_amount,
    currency: agreement.currency,
  };
}

// Staff could not confirm the transfer: payments return to 'scheduled' and the submitted
// evidence is cleared so the founder can send the correct amount and resubmit.
export async function rejectAgreementFunding(agreementId: string): Promise<boolean> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error('Error rejecting funding: service role client not configured');
    return false;
  }

  const { error } = await supabase
    .from('payments')
    .update({ status: 'scheduled', tx_hash: null, network: null, submitted_at: null })
    .eq('agreement_id', agreementId)
    .eq('status', 'pending');

  if (error) {
    console.error('Error rejecting funding:', error.message);
    return false;
  }

  return true;
}

// Staff releases one milestone payment to the operator after the founder approved the
// delivered work. Only payments currently held ('paid') can be released.
export async function releasePaymentToOperator(paymentId: string): Promise<{
  id: string;
  conversation_id: string;
  title: string;
  amount: number;
  currency: string;
} | null> {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error('Error releasing payment: service role client not configured');
    return null;
  }

  const { data, error } = await supabase
    .from('payments')
    .update({ status: 'released', released_at: new Date().toISOString() })
    .eq('id', paymentId)
    .eq('status', 'paid')
    .select('id, conversation_id, title, amount, currency')
    .maybeSingle();

  if (error) {
    console.error('Error releasing payment:', error.message);
    return null;
  }

  return data ?? null;
}

// ---------- Tasks ----------

export interface Task {
  id?: string;
  conversation_id: string;
  milestone_id?: string | null;
  title: string;
  description?: string | null;
  assignee_id?: string | null;
  assignee_name?: string | null;
  status?: string | null;
  due_date?: string | null;
  created_at?: string;
  updated_at?: string;
}

export type ChatTaskStatus = 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'DONE';

export const CHAT_TASK_STATUSES: ChatTaskStatus[] = ['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'];

export async function getConversationTasks(conversationId: string): Promise<Task[]> {
  const supabase = await db();

  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching tasks:', error.message);
    return [];
  }

  return data ?? [];
}

export async function createTask(task: Task): Promise<Task | null> {
  const supabase = await db();

  const { data, error } = await supabase
    .from('tasks')
    .insert({ status: 'TODO', ...task })
    .select()
    .maybeSingle();

  if (error) {
    console.error('Error creating task:', error.message);
    return null;
  }

  return data ?? null;
}

// AI-drafted tasks behave like AI milestones: each pass rewrites them in place (RLS allows
// insert and update, not delete) and superseded drafts are marked DONE so the board keeps
// history without duplicates. Tasks claimed by a human (assignee set or status advanced) are
// never rewritten.
export async function replaceDraftTasks(
  conversationId: string,
  tasks: {
    title: string;
    description?: string | null;
    assignee_name?: string | null;
    milestone_sequence?: number | null;
  }[]
): Promise<Task[]> {
  const rows = tasks
    .map((task) => ({
      title: String(task.title ?? '').trim(),
      description: task.description ?? null,
      assignee_name: task.assignee_name ?? null,
      milestone_sequence: task.milestone_sequence ?? null,
    }))
    .filter((row) => row.title.length > 0)
    .slice(0, 20);

  if (rows.length === 0) {
    return [];
  }

  // Same atomic pattern as the milestones replace (migration 0014): pairing,
  // reuse, insert and retire run in one transaction behind the conversation
  // lock, so concurrent AI passes serialize. milestone_sequence resolves
  // against draft milestones only; a claimed or advanced task is never
  // touched because the SQL keeps only unassigned TODOs as drafts.
  try {
    const { error } = await rpcForCaller('replace_draft_tasks', {
      p_conversation_id: conversationId,
      p_rows: rows,
    });
    if (error) {
      console.error('Error replacing draft tasks:', error.message);
      return [];
    }
  } catch (cause) {
    console.error(
      'Error replacing draft tasks:',
      cause instanceof Error ? cause.message : cause
    );
    return [];
  }

  return getConversationTasks(conversationId);
}

export async function getTask(taskId: string) {
  const supabase = await db();

  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .eq('id', taskId)
    .maybeSingle();

  if (error) {
    console.error('Error fetching task:', error.message);
    return null;
  }

  return data ?? null;
}

// Task status flow: TODO -> IN_PROGRESS -> REVIEW -> DONE. Staff (participants) may move any
// task; the founder may only accept a delivered task (REVIEW -> DONE) once the project is
// ACCEPTED, ACTIVE or COMPLETED.
export function nextTaskStatusFor(
  current: string,
  isStaff: boolean,
  conversationStatus: string
): ChatTaskStatus | null {
  const order: ChatTaskStatus[] = ['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'];
  const normalized = (order.includes(current as ChatTaskStatus) ? current : 'TODO') as ChatTaskStatus;
  const index = order.indexOf(normalized);

  if (isStaff) {
    return index >= order.length - 1 ? null : order[index + 1];
  }

  const delivered = ['ACCEPTED', 'ACTIVE', 'COMPLETED'].includes(conversationStatus);

  if (delivered && normalized === 'REVIEW') {
    return 'DONE';
  }

  return null;
}

export async function updateTaskStatus(taskId: string, status: ChatTaskStatus) {
  const supabase = await db();

  const { data, error } = await supabase
    .from('tasks')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', taskId)
    .select()
    .maybeSingle();

  if (error) {
    console.error('Error updating task status:', error.message);
    return null;
  }

  return data ?? null;
}

export async function updateTaskDueDate(taskId: string, dueDate: string | null) {
  const supabase = await db();

  const { data, error } = await supabase
    .from('tasks')
    .update({ due_date: dueDate, updated_at: new Date().toISOString() })
    .eq('id', taskId)
    .select()
    .maybeSingle();

  if (error) {
    console.error('Error updating task due date:', error.message);
    return null;
  }

  return data ?? null;
}

export async function assignTask(
  taskId: string,
  assignee: { assignee_id?: string | null; assignee_name?: string | null }
) {
  const supabase = await db();

  const { data, error } = await supabase
    .from('tasks')
    .update({
      ...(assignee.assignee_id !== undefined ? { assignee_id: assignee.assignee_id } : {}),
      ...(assignee.assignee_name !== undefined ? { assignee_name: assignee.assignee_name } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', taskId)
    .select()
    .maybeSingle();

  if (error) {
    console.error('Error assigning task:', error.message);
    return null;
  }

  return data ?? null;
}

// __PROJECT_DB_TASKS__

// ---------- Participants ----------

export async function addParticipant(participant: {
  conversation_id: string;
  user_id: string;
  role: 'founder' | 'operator' | 'builder' | 'observer';
  display_name?: string;
}) {
  const supabase = await db();

  // The founder's RLS policies allow insert (not update), so an existing participant is
  // treated as success instead of being upserted.
  const { data, error } = await supabase
    .from('participants')
    .insert(participant)
    .select()
    .maybeSingle();

  if (error) {
    if (error.code === '23505') {
      const { data: existing } = await supabase
        .from('participants')
        .select('*')
        .eq('conversation_id', participant.conversation_id)
        .eq('user_id', participant.user_id)
        .maybeSingle();

      return existing ?? null;
    }

    console.error('Error adding participant:', error.message);
    return null;
  }

  return data ?? null;
}

export async function getParticipants(conversationId: string, asStaff?: boolean) {
  const supabase = await readClient(asStaff);

  const { data, error } = await supabase
    .from('participants')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('joined_at', { ascending: true });

  if (error) {
    console.error('Error fetching participants:', error.message);
    return [];
  }

  return data ?? [];
}

// ---------- Owner deletes ----------

export type DeleteOutcome = 'deleted' | 'not_found' | 'forbidden' | 'not_configured' | 'failed';

// Deleting a conversation removes the chat and everything hanging off it (messages, requirements,
// proposals, milestones, agreements, payments, tasks, participants) via ON DELETE CASCADE.
// Ownership is checked with the caller's own session; the delete itself uses the service role
// because the child tables carry no DELETE policy for the founder.
export async function deleteConversationForUser(
  userId: string,
  conversationId: string
): Promise<DeleteOutcome> {
  const trimmed = String(conversationId ?? '').trim();

  if (!trimmed) {
    return 'not_found';
  }

  const conversation = await getConversation(trimmed);

  if (!conversation) {
    return 'not_found';
  }

  if (conversation.user_id !== userId && !(await isAdminAccount(userId))) {
    return 'forbidden';
  }

  const admin = createSupabaseAdminClient();

  if (!admin) {
    console.error('Deleting a conversation needs SUPABASE_SERVICE_ROLE_KEY to be configured.');
    return 'not_configured';
  }

  const { error } = await admin.from('conversations').delete().eq('id', trimmed);

  if (error) {
    console.error('Error deleting conversation:', error.message);
    return 'failed';
  }

  return 'deleted';
}

