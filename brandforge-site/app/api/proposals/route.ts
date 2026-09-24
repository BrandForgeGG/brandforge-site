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
  updateConversationStatus,
} from '@/lib/project-db';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { notify } from '@/lib/notify';

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
      content: `BrandForge sent a proposal: ${title}. Review it on the right and accept, decline or request changes here in the chat.`,
      content_type: 'system',
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

    return NextResponse.json({ success: true, proposal });
  } catch (error) {
    console.error('Create proposal API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create proposal' },
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
    if (ownerId !== user.id && !isStaff) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const founderStatuses = ['accepted', 'declined', 'changes_requested'];
    if (!isStaff && !founderStatuses.includes(status)) {
      return NextResponse.json(
        { error: 'Only BrandForge staff can set this proposal status' },
        { status: 403 }
      );
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
      });

      if (status === 'accepted') {
        await updateConversationStatus(proposal.conversation_id, 'ACCEPTED');
      } else if (status === 'changes_requested' || status === 'declined') {
        await updateConversationStatus(proposal.conversation_id, 'READY_FOR_REVIEW');
      }

      await notify('proposal_answered', { title: existing.title, status });
    }

    return NextResponse.json({ success: true, proposal });
  } catch (error) {
    console.error('Update proposal API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update proposal' },
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
      { error: error instanceof Error ? error.message : 'Failed to get proposal' },
      { status: 500 }
    );
  }
}
