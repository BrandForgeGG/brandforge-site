import { NextRequest, NextResponse } from 'next/server';
import {
  createAgreement,
  updateAgreementStatus,
  getAgreement,
  createPayments,
  getPayments,
  getMilestones,
  getProposal,
  getConversationOwnerId,
  canAccessConversation,
  addMessage,
  isStaffAccount,
} from '@/lib/project-db';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { canCreateAgreement, canUpdateAgreement } from '@/lib/money-authz.js';

export const dynamic = 'force-dynamic';

// An agreement is created when the founder accepts a BrandForge proposal in the chat.
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json();
    const { conversationId, proposalId, terms, totalAmount } = body;

    if (!conversationId || !proposalId || !terms || !totalAmount) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Accepting a proposal creates a binding agreement with a payment schedule, so only the
    // founder who owns the conversation can do it - not other participants.
    const isStaff = await isStaffAccount(user.id);
    const ownerId = await getConversationOwnerId(conversationId);

    // Shared, unit-tested decision (lib/money-authz.js).
    const decision = canCreateAgreement({ actor: { userId: user.id, isStaff }, ownerId });

    if (!decision.allowed) {
      return NextResponse.json({ error: decision.reason }, { status: decision.status });
    }

    // The agreement must belong to this conversation and the proposal must have been accepted.
    const proposal = await getProposal(conversationId);
    if (!proposal || proposal.id !== proposalId || proposal.status !== 'accepted') {
      return NextResponse.json(
        { error: 'The proposal must be accepted before an agreement is created' },
        { status: 409 }
      );
    }

    const existing = await getAgreement(conversationId);
    if (existing) {
      return NextResponse.json({ success: true, agreement: existing });
    }

    const agreement = await createAgreement({
      conversation_id: conversationId,
      proposal_id: proposalId,
      terms,
      total_amount: totalAmount,
      currency: 'EUR',
    });

    if (!agreement) {
      return NextResponse.json({ error: 'Failed to create agreement' }, { status: 500 });
    }

    const milestones = await getMilestones(conversationId);
    if (milestones.length > 0) {
      await createPayments(agreement.id, milestones);
    }

    await addMessage({
      conversation_id: conversationId,
      sender_type: 'ai',
      sender_name: 'BrandForge',
      content: 'Agreement created and awaiting funding. Submit your transaction hash here in the chat or in the project panel.',
      content_type: 'system',
      artifact_data: { type: 'agreement', id: agreement.id, status: agreement.status },
    });

    return NextResponse.json({ success: true, agreement });
  } catch (error) {
    console.error('Create agreement API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create agreement' },
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
    const { agreementId, status } = body;

    if (!agreementId || !status) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Agreement lifecycle is staff work. 'funded' is never set here: funding only happens
    // through /api/payments after the client's crypto transfer is verified on-chain.
    // Shared, unit-tested decision (lib/money-authz.js).
    const isStaff = await isStaffAccount(user.id);
    const decision = canUpdateAgreement({ actor: { userId: user.id, isStaff }, status });

    if (!decision.allowed) {
      return NextResponse.json({ error: decision.reason }, { status: decision.status });
    }

    const agreement = await updateAgreementStatus(agreementId, status);

    if (!agreement) {
      return NextResponse.json({ error: 'Failed to update agreement' }, { status: 500 });
    }

    return NextResponse.json({ success: true, agreement });
  } catch (error) {
    console.error('Update agreement API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update agreement' },
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

    const [agreement, payments] = await Promise.all([
      getAgreement(conversationId, isStaff),
      getPayments(conversationId, isStaff),
    ]);

    return NextResponse.json({ agreement, payments });
  } catch (error) {
    console.error('Get agreement API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get agreement' },
      { status: 500 }
    );
  }
}
