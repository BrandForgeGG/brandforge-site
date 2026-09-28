import { NextRequest, NextResponse } from 'next/server';
import {
  createProposal,
  updateProposalStatus,
  getProposal,
  getProposalById,
  getConversationOwnerId,
  canAccessConversation,
  addMessage,
  isStaffAccount,
  recordFunnelEvent,
  updateConversationStatus,
  inviteProposalAuthor,
  getTelegramChatIdForUser,
} from '@/lib/project-db';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { canSetProposalStatus } from '@/lib/money-authz.js';
import { notify, notifyUser } from '@/lib/notify';
import { notifyFounder } from '@/lib/stage-notify';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json();
    const { conversationId, title, scope, deliverables, totalAmount, estimatedWeeksMin, estimatedWeeksMax } = body;

    if (!conversationId || !title || !totalAmount) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const hasAccess = await canAccessConversation(user.id, conversationId, { allowStaff: true });
    
    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // A proposal is a priced offer from BrandForge; only staff may issue one. The founder's
    // job is to accept, decline or request changes via PATCH.
    const isStaff = await isStaffAccount(user.id);
    if (!isStaff) {
      return NextResponse.json(
        { error: 'Only BrandForge staff can issue proposals' },
        { status: 403 }
      );
    }

    const proposal = await createProposal({
      conversation_id: conversationId,
      title,
      scope,
      deliverables,
      total_amount: totalAmount,
      currency: 'EUR',
      estimated_weeks_min: estimatedWeeksMin,
      estimated_weeks_max: estimatedWeeksMax,
      created_by: user.id,
    });

    if (!proposal) {
      return NextResponse.json({ error: 'Failed to create proposal' }, { status: 500 });
    }

    await updateConversationStatus(conversationId, 'PROPOSED');
    await addMessage({
      conversation_id: conversationId,
      sender_type: 'ai',
      sender_name: 'BrandForge',
      content: `BrandForge sent a proposal: ${title}. Accept it here in the chat, or open the project panel to read the full scope.`,
      content_type: 'system',
      // The card carries its own priced-offer snapshot so it renders the price,
      // timeline and scope without another fetch — and keeps showing them forever.
      artifact_data: {
        type: 'proposal',
        id: proposal.id,
        status: proposal.status,
        title,
        totalAmount,
        currency: 'EUR',
        weeksMin: estimatedWeeksMin ?? null,
        weeksMax: estimatedWeeksMax ?? null,
        scope: scope ?? null,
      },
    });

    // Recorded server-side at the moment the proposal actually exists.
    await recordFunnelEvent('proposal_received', {
      signedIn: true,
      properties: { total_amount: totalAmount, currency: 'EUR', stage: 'proposal' },
    });

    await notify('proposal_sent', {
      title,
      totalAmount,
      currency: 'EUR',
      weeks:
        estimatedWeeksMin && estimatedWeeksMax
          ? `${estimatedWeeksMin}–${estimatedWeeksMax} weeks`
          : null,
    });

    // The offer must reach the founder even when Telegram is unlinked: email +
    // linked Telegram ping, best-effort, never blocks the proposal itself.
    await notifyFounder(conversationId, 'proposal_ready', {
      title,
      totalAmount,
      currency: 'EUR',
      weeks:
        estimatedWeeksMin && estimatedWeeksMax
          ? `${estimatedWeeksMin}–${estimatedWeeksMax} weeks`
          : null,
    });

    return NextResponse.json({ success: true, proposal });
  } catch (error) {
    console.error('Create proposal API error:', error);
    return NextResponse.json(
      { error: 'Failed to create proposal' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json();
    const { proposalId, status } = body;

    if (!proposalId || !status) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const allowed = ['pending', 'changes_requested', 'accepted', 'declined', 'expired'];
    if (!allowed.includes(status)) {
      return NextResponse.json({ error: 'Invalid proposal status' }, { status: 400 });
    }

    // Only the founder who owns the conversation (or BrandForge staff) may change a proposal,
    // and founders may only answer it - lifecycle housekeeping is staff work.
    const existing = await getProposalById(proposalId);
    if (!existing) {
      return NextResponse.json({ error: 'Proposal not found' }, { status: 404 });
    }

    const isStaff = await isStaffAccount(user.id);
    const ownerId = await getConversationOwnerId(existing.conversation_id);

    // Shared, unit-tested decision (lib/money-authz.js): the owner may answer a proposal, staff may
    // do anything, and a different founder is refused. The test suite covers that cross-user case.
    const decision = canSetProposalStatus({
      actor: { userId: user.id, isStaff },
      ownerId,
      status,
    });

    if (!decision.allowed) {
      return NextResponse.json({ error: decision.reason }, { status: decision.status });
    }

    const proposal = await updateProposalStatus(proposalId, status);

    if (!proposal) {
      return NextResponse.json({ error: 'Failed to update proposal' }, { status: 500 });
    }

    // The founder's decision lives in the same chat as the proposal.
    const statusLine =
      status === 'accepted'
        ? 'Proposal accepted. The agreement and payment schedule are being prepared in this chat.'
        : status === 'changes_requested'
          ? 'The founder requested changes to the proposal. BrandForge will revise it here.'
          : status === 'declined'
            ? 'The founder declined the proposal.'
            : null;

    if (statusLine && proposal.conversation_id) {
      await addMessage({
        conversation_id: proposal.conversation_id,
        sender_type: 'ai',
        sender_name: 'BrandForge',
        content: statusLine,
        content_type: 'system',
        // Same snapshot as the send card, read from the updated row so an accepted
        // card keeps showing the settled terms.
        artifact_data: {
          type: 'proposal',
          id: proposalId,
          status,
          title: existing.title,
          totalAmount: proposal.total_amount,
          currency: proposal.currency ?? existing.currency ?? 'EUR',
          weeksMin: proposal.estimated_weeks_min,
          weeksMax: proposal.estimated_weeks_max,
          scope: existing.scope ?? null,
        },
      });

      if (status === 'accepted') {
        await updateConversationStatus(proposal.conversation_id, 'ACCEPTED');
        // The accept IS the invite: the proposal's author joins with a visible
        // system line, so the founder sees exactly who won the work.
        await inviteProposalAuthor(existing);
      } else if (status === 'changes_requested' || status === 'declined') {
        await updateConversationStatus(proposal.conversation_id, 'READY_FOR_REVIEW');
      }

      await notify('proposal_answered', { title: existing.title, status });

      // The author waits on this answer personally: ping their linked Telegram
      // (skipped when they answered it themselves). Unlinked or unconfigured is
      // a silent no-op, and the send never blocks the answer itself.
      if (existing.created_by && existing.created_by !== user.id) {
        const authorChatId = await getTelegramChatIdForUser(existing.created_by);
        if (authorChatId) {
          await notifyUser(authorChatId, 'proposal_answered', {
            title: existing.title,
            status,
          });
        }
      }

      if (status === 'accepted') {
        await recordFunnelEvent('proposal_accepted', {
          signedIn: true,
          properties: { total_amount: existing.total_amount, currency: existing.currency, stage: 'fund' },
        });
      }
    }

    return NextResponse.json({ success: true, proposal });
  } catch (error) {
    console.error('Update proposal API error:', error);
    return NextResponse.json(
      { error: 'Failed to update proposal' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const conversationId = searchParams.get('conversationId');

    if (!conversationId) {
      return NextResponse.json({ error: 'conversationId required' }, { status: 400 });
    }

    const isStaff = await isStaffAccount(user.id);
    const hasAccess = await canAccessConversation(user.id, conversationId, { allowStaff: true });
    
    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const proposal = await getProposal(conversationId, isStaff);

    return NextResponse.json({ proposal });
  } catch (error) {
    console.error('Get proposal API error:', error);
    return NextResponse.json(
      { error: 'Failed to get proposal' },
      { status: 500 }
    );
  }
}
