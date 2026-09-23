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
import { headers } from 'next/headers';

export type ProjectDbClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

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
  created_at: string;
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
  const supabase = await db();

  const { error } = await supabase
    .from('conversations')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', conversationId);

  if (error) {
    console.error('Error updating conversation status:', error.message);
    return false;
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
// Participant roles that mean "a BrandForge human is in this chat" (the founder is not staff).
const STAFF_PARTICIPANT_ROLES = new Set(['operator', 'builder', 'observer']);

async function buildConversationSummaries(userId?: string): Promise<ConversationSummary[]> {
  const supabase = await db();

  const orderedQuery = supabase
    .from('conversations')
    .select('id, title, status, created_at')
    .order('created_at', { ascending: false });

  const { data: conversations, error } = await (userId
    ? orderedQuery.eq('user_id', userId)
    : orderedQuery
  ).limit(50);

  if (error) {
    console.error('Error fetching conversation summaries:', error.message);
    return [];
  }

  if (!conversations || conversations.length === 0) {
    return [];
  }

  const conversationIds = conversations.map((conversation: { id: string }) => conversation.id);

  const [contextsResult, messagesResult, participantsResult] = await Promise.all([
    supabase
      .from('project_context')
      .select('conversation_id, project_name')
      .in('conversation_id', conversationIds),
    supabase
      .from('messages')
      .select('conversation_id, content, sender_type, created_at')
      .in('conversation_id', conversationIds)
      .order('created_at', { ascending: true }),
    // Staff presence already lives in participants (role operator/builder/observer), so
    // "the team has seen this chat" needs no extra table, column or migration.
    supabase
      .from('participants')
      .select('conversation_id, role, display_name, joined_at')
      .in('conversation_id', conversationIds)
      .order('joined_at', { ascending: true }),
  ]);

  const projectNames = new Map<string, string>();
  for (const context of contextsResult.data ?? []) {
    const name = String(context.project_name ?? '').trim();
    if (name) {
      projectNames.set(context.conversation_id, name);
    }
  }

  const messagesByConversation = new Map<
    string,
    { content: string; sender_type: string; created_at: string }[]
  >();
  for (const message of messagesResult.data ?? []) {
    const bucket = messagesByConversation.get(message.conversation_id) ?? [];
    bucket.push(message);
    messagesByConversation.set(message.conversation_id, bucket);
  }

  const staffByConversation = new Map<string, { name: string; at: string }>();

  for (const participant of participantsResult.data ?? []) {
    if (!STAFF_PARTICIPANT_ROLES.has(String(participant.role))) {
      continue;
    }

    // The first staff member to open the chat is the moment the founder can see.
    if (staffByConversation.has(participant.conversation_id)) {
      continue;
    }

    staffByConversation.set(participant.conversation_id, {
      name: String(participant.display_name ?? '').trim() || 'BrandForge team',
      at: String(participant.joined_at ?? ''),
    });
  }

  const summaries: ConversationSummary[] = [];

  for (const conversation of conversations) {
    const messages = messagesByConversation.get(conversation.id) ?? [];
    if (messages.length === 0) {
      continue;
    }

    const firstFounderMessage = messages.find((message) => message.sender_type === 'user');
    const lastMessage = messages[messages.length - 1];
    const storedTitle = String(conversation.title ?? '').trim();
    const title =
      projectNames.get(conversation.id) ||
      (storedTitle && storedTitle !== 'New Project' ? storedTitle : '') ||
      truncate(firstFounderMessage?.content ?? storedTitle, 60) ||
      'New conversation';

    const staffView = staffByConversation.get(conversation.id) ?? null;

    summaries.push({
      id: conversation.id,
      title,
      status: conversation.status ?? 'DISCOVERY',
      messageCount: messages.length,
      lastActivity: lastMessage?.created_at ?? null,
      preview: truncate(lastMessage?.content ?? '', 90) || null,
      staffViewedAt: staffView?.at || null,
      staffViewedBy: staffView?.name ?? null,
      isUnseen: staffView === null,
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

export interface PlatformCounts {
  registered: number | null;
  staff: number | null;
}

// Platform-wide counters for the rail: how many accounts exist and how many are BrandForge staff.
// RLS only exposes the signed-in account's own profile row, so these counts are read with the
// service role. null means the key is not configured - the rail shows a dash rather than a
// fabricated number.
export async function getPlatformCounts(): Promise<PlatformCounts> {
  const admin = createSupabaseAdminClient();

  if (!admin) {
    return { registered: null, staff: null };
  }

  const [registeredResult, staffResult] = await Promise.all([
    admin.from('profiles').select('id', { count: 'exact', head: true }),
    admin
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .in('role', ['admin', 'operator']),
  ]);

  if (registeredResult.error) {
    console.error('Error counting registered users:', registeredResult.error.message);
  }

  if (staffResult.error) {
    console.error('Error counting staff accounts:', staffResult.error.message);
  }

  return {
    registered: registeredResult.error ? null : registeredResult.count ?? 0,
    staff: staffResult.error ? null : staffResult.count ?? 0,
  };
}

// ---------- Messages ----------

export async function addMessage(message: {
  conversation_id: string;
  sender_type: 'user' | 'ai' | 'human_operator' | 'human_builder';
  sender_id?: string | null;
  sender_name?: string | null;
  content: string;
  content_type?: string;
  artifact_data?: Record<string, unknown> | null;
}): Promise<string | null> {
  const supabase = await db();

  const { data, error } = await supabase
    .from('messages')
    .insert(message)
    .select('id')
    .maybeSingle();

  if (error) {
    console.error('Error adding message:', error.message);
    return null;
  }

  return data?.id ?? null;
}

export async function getMessages(
  conversationId: string,
  options?: { limit?: number }
): Promise<ConversationMessage[]> {
  const supabase = await db();
  const limit = options?.limit;

  if (typeof limit === 'number' && limit > 0) {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching messages:', error.message);
      return [];
    }

    return (data ?? []).slice().reverse();
  }

  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching messages:', error.message);
    return [];
  }

  return data ?? [];
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

export async function updateProposalStatus(
  proposalId: string,
  status: 'pending' | 'changes_requested' | 'accepted' | 'declined' | 'expired'
) {
  // Runs as the service role after the route has authorized the caller (founder or staff).
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.error('Error updating proposal status: service role client not configured');
    return null;
  }

  const { data, error } = await supabase
    .from('proposals')
    .update({
      status,
      ...(status === 'accepted' ? { accepted_at: new Date().toISOString() } : {}),
    })
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
// drafts are marked 'cancelled' so history stays intact and nothing is ever duplicated.
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

  const supabase = await db();
  const existing = (await getConversationMilestones(conversationId)).filter(
    (milestone) => !milestone.proposal_id
  );

  const reusable = Math.min(existing.length, rows.length);

  for (let index = 0; index < reusable; index += 1) {
    const target = existing[index];
    const next = rows[index];

    const { error } = await supabase
      .from('milestones')
      .update({
        sequence: next.sequence,
        title: next.title,
        description: next.description,
        amount: next.amount,
        estimated_weeks: next.estimated_weeks,
        currency: 'EUR',
        status: 'pending',
      })
      .eq('id', target.id);

    if (error) {
      console.error('Error updating draft milestone:', error.message);
    }
  }

  const newRows = rows.slice(reusable).map((row) => ({
    conversation_id: conversationId,
    currency: 'EUR',
    status: 'pending',
    ...row,
  }));

  if (newRows.length > 0) {
    const { error } = await supabase.from('milestones').insert(newRows);

    if (error) {
      console.error('Error inserting draft milestones:', error.message);
    }
  }

  const surplus = existing.slice(reusable);

  for (const milestone of surplus) {
    const { error } = await supabase
      .from('milestones')
      .update({ status: 'cancelled' })
      .eq('id', milestone.id);

    if (error) {
      console.error('Error retiring draft milestone:', error.message);
    }
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

export async function getTaskMilestoneMap(conversationId: string): Promise<Map<string, string>> {
  const milestones = await getConversationMilestones(conversationId);
  const map = new Map<string, string>();

  for (const milestone of milestones) {
    if (milestone.id && typeof milestone.sequence === 'number') {
      map.set(String(milestone.sequence), String(milestone.id));
    }
  }

  return map;
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

  const supabase = await db();
  const milestoneMap = await getTaskMilestoneMap(conversationId);
  const existing = (await getConversationTasks(conversationId)).filter(
    (task) => !task.assignee_id && (task.status ?? 'TODO') === 'TODO'
  );

  const reusable = Math.min(existing.length, rows.length);

  for (let index = 0; index < reusable; index += 1) {
    const target = existing[index];
    const next = rows[index];
    const milestoneId =
      next.milestone_sequence !== null ? milestoneMap.get(String(next.milestone_sequence)) ?? null : null;

    const { error } = await supabase
      .from('tasks')
      .update({
        title: next.title,
        description: next.description,
        assignee_name: next.assignee_name,
        milestone_id: milestoneId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', target.id);

    if (error) {
      console.error('Error updating draft task:', error.message);
    }
  }

  const newRows = rows.slice(reusable).map((row) => ({
    conversation_id: conversationId,
    title: row.title,
    description: row.description,
    assignee_name: row.assignee_name,
    milestone_id:
      row.milestone_sequence !== null ? milestoneMap.get(String(row.milestone_sequence)) ?? null : null,
    status: 'TODO',
  }));

  if (newRows.length > 0) {
    const { error } = await supabase.from('tasks').insert(newRows);

    if (error) {
      console.error('Error inserting draft tasks:', error.message);
    }
  }

  const surplus = existing.slice(reusable);

  for (const task of surplus) {
    const { error } = await supabase
      .from('tasks')
      .update({ status: 'DONE', updated_at: new Date().toISOString() })
      .eq('id', task.id);

    if (error) {
      console.error('Error retiring draft task:', error.message);
    }
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

