import { NextRequest, NextResponse } from 'next/server';
import { addMessage, addTeammateParticipant, claimConversation, getConversationClaim, getParticipants, getProfileDisplayName, getProfileRole, listStaffMembers, releaseConversation } from '@/lib/project-db';
import { ensureStaffParticipant, requireStaffContext } from '@/lib/staff';
import { notifyTeammateAdded } from '@/lib/stage-notify';
import { checkRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

// Claimed chats, like tickets. One team member claims a chat and talks in it; other team members can talk there only
// once the claimer adds them (admins can always step in). Handing it back opens it to the whole team again.
//
// GET ?conversationId=  -> who has it, whether you may claim it, add people or hand it back, and the team to add from.
// POST { conversationId, action: 'claim' | 'release' | 'add', userId? }

async function status(conversationId: string, me: string, isAdmin: boolean) {
  const [claim, participants] = await Promise.all([getConversationClaim(conversationId), getParticipants(conversationId, true)]);
  const claimerName = claim.claimedBy ? await getProfileDisplayName(claim.claimedBy) : null;
  const mine = claim.claimedBy === me;
  const inChat = participants.some((entry) => entry.user_id === me);
  const members = new Set(participants.map((entry) => entry.user_id));
  const team = mine || isAdmin ? (await listStaffMembers()).filter((person) => person.id !== me && !members.has(person.id) && person.id !== claim.claimedBy) : [];
  return {
    claimedBy: claim.claimedBy,
    claimerName,
    claimedAt: claim.claimedAt,
    mine,
    canClaim: !claim.claimedBy,
    canTalk: isAdmin || mine || inChat || !claim.claimedBy,
    canManage: Boolean(claim.claimedBy) && (mine || isAdmin),
    team,
  };
}

export async function GET(request: NextRequest) {
  const context = await requireStaffContext(request.nextUrl.searchParams.get('conversationId') ?? '', request);
  if (context instanceof NextResponse) return context;
  return NextResponse.json(await status(context.conversationId, context.user.id, context.profileRole === 'admin'), { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { conversationId?: unknown; action?: unknown; userId?: unknown };
  const context = await requireStaffContext(String(body.conversationId ?? ''), request);
  if (context instanceof NextResponse) return context;
  if (context.role === 'founder') return NextResponse.json({ error: 'This is your own chat.' }, { status: 400 });
  if (!checkRateLimit(`claim:${context.user.id}`, { limit: 60, windowMs: 60 * 60 * 1000 }).allowed) return NextResponse.json({ error: 'Too many changes. Try again later.' }, { status: 429 });
  const isAdmin = context.profileRole === 'admin';
  const id = context.conversationId;
  const me = context.displayName;

  if (body.action === 'claim') {
    if (!(await claimConversation(id, context.user.id))) {
      const claim = await getConversationClaim(id);
      const name = claim.claimedBy ? await getProfileDisplayName(claim.claimedBy) : 'someone';
      return NextResponse.json({ error: `${name} already has this chat. Ask them to add you.` }, { status: 409 });
    }
    await ensureStaffParticipant(context);
    await addMessage({ conversation_id: id, sender_type: 'ai', sender_name: 'BrandForge', content: `${me} from the BrandForge team has your chat and will answer you here.`, content_type: 'system' });
    return NextResponse.json(await status(id, context.user.id, isAdmin));
  }

  const claim = await getConversationClaim(id);
  const canManage = Boolean(claim.claimedBy) && (claim.claimedBy === context.user.id || isAdmin);

  if (body.action === 'release') {
    if (!canManage) return NextResponse.json({ error: 'Only whoever has this chat can hand it back.' }, { status: 403 });
    await releaseConversation(id);
    await addMessage({ conversation_id: id, sender_type: 'ai', sender_name: 'BrandForge', content: `${me} handed this chat back to the team. Someone will pick it up.`, content_type: 'system' });
    return NextResponse.json(await status(id, context.user.id, isAdmin));
  }

  if (body.action === 'add') {
    if (!canManage) return NextResponse.json({ error: 'Only whoever has this chat can add people to it.' }, { status: 403 });
    const userId = String(body.userId ?? '');
    const role = /^[0-9a-f-]{36}$/i.test(userId) ? await getProfileRole(userId) : null;
    if (role !== 'operator' && role !== 'admin') return NextResponse.json({ error: 'Pick someone on the team.' }, { status: 400 });
    const participants = await getParticipants(id, true);
    const name = await getProfileDisplayName(userId);
    if (!participants.some((entry) => entry.user_id === userId)) {
      const added = await addTeammateParticipant(id, userId, name);
      if (!added) return NextResponse.json({ error: 'Could not add them. Try again.' }, { status: 500 });
      await addMessage({ conversation_id: id, sender_type: 'ai', sender_name: 'BrandForge', content: `${me} added ${name} to help with this chat.`, content_type: 'system' });
      await notifyTeammateAdded(userId, id, me, '');
    }
    return NextResponse.json(await status(id, context.user.id, isAdmin));
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
}
