import { NextRequest, NextResponse } from 'next/server';
import {
  createAgreement,
  updateAgreementStatus,
  updateAgreementTerms,
  acceptAgreement,
  getAgreement,
  getAgreementById,
  createPayments,
  getPayments,
  getMilestones,
  getProposal,
  getConversationOwnerId,
  canAccessConversation,
  addMessage,
  isStaffAccount,
  recordFunnelEvent,
  type Milestone,
} from '@/lib/project-db';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import {
  canCreateAgreement,
  canUpdateAgreement,
  canEditAgreementTerms,
  canAcceptAgreement,
  reconcileSchedule,
} from '@/lib/money-authz.js';
import { notify } from '@/lib/notify';
import { notifyFounder } from '@/lib/stage-notify';
import { postOpsEvent } from '@/lib/ops-events';

export const dynamic = 'force-dynamic';

// An agreement is created when the founder accepts a BrandForge proposal in the chat.
// The contract's total and terms are derived from the accepted proposal on the server —
// the request body carries neither (H3: client-supplied totals could move escrow money).
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json();
    const { conversationId, proposalId } = body;

    if (!conversationId || !proposalId) {
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

    const totalAmount = Number(proposal.total_amount);
    const currency = String(proposal.currency ?? 'EUR');
    const terms = `BrandForge project agreement for ${proposal.title}. Total ${currency} ${proposal.total_amount}. Estimated delivery ${proposal.estimated_weeks_min ?? "?"}-${proposal.estimated_weeks_max ?? "?"} weeks.`;

    // The schedule must partition the contract total exactly, or funding verification and
    // milestone releases would disagree about how much escrow holds.
    const milestones = await getMilestones(conversationId);
    const schedule = reconcileSchedule(milestones, totalAmount);

    if (!schedule.ok) {
      return NextResponse.json({ error: schedule.reason }, { status: schedule.status });
    }

    const agreement = await createAgreement({
      conversation_id: conversationId,
      proposal_id: proposalId,
      terms,
      total_amount: totalAmount,
      currency,
    });

    if (!agreement) {
      return NextResponse.json({ error: 'Failed to create agreement' }, { status: 500 });
    }

    if (schedule.milestones.length > 0) {
      await createPayments(agreement.id, schedule.milestones as Milestone[]);
    }

    await addMessage({
      conversation_id: conversationId,
      sender_type: 'ai',
      sender_name: 'BrandForge',
      content: 'Agreement created and awaiting funding. Submit your transaction hash here in the chat or in the project panel.',
      content_type: 'system',
      artifact_data: { type: 'agreement', id: agreement.id, status: agreement.status },
    });

    // Staff ops channel: terms proposed for this pair, priced (staff-only).
    await postOpsEvent('contract_proposed', {
      title: proposal.title,
      totalAmount,
      currency,
      milestoneCount: schedule.milestones.length,
    });

    return NextResponse.json({ success: true, agreement });
  } catch (error) {
    console.error('Create agreement API error:', error);
    return NextResponse.json(
      { error: 'Failed to create agreement' },
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
    const { agreementId, status, terms } = body;
    const action = typeof body.action === 'string' ? body.action : '';

    if (!agreementId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const isStaff = await isStaffAccount(user.id);
    const agreement = await getAgreementById(agreementId);

    if (!agreement) {
      return NextResponse.json({ error: 'Agreement not found' }, { status: 404 });
    }

    const ownerId = await getConversationOwnerId(agreement.conversation_id);
    const actor = { userId: user.id, isStaff };
    const isOwner = user.id === ownerId;

    // ---- Contract signature: this side accepts the current terms (chat contract card). ----
    if (action === 'accept') {
      const decision = canAcceptAgreement({ actor, ownerId });
      if (!decision.allowed) {
        return NextResponse.json({ error: decision.reason }, { status: decision.status });
      }

      // Signing happens before money moves: after funding the contract is live and edits
      // or late signatures would break what escrow was verified against.
      if (agreement.status !== 'pending_funding') {
        return NextResponse.json(
          { error: 'This contract can only be signed while it awaits funding' },
          { status: 409 }
        );
      }

      const updated = await acceptAgreement(agreementId, isOwner ? 'founder' : 'team');
      if (!updated) {
        return NextResponse.json({ error: 'Failed to accept the contract' }, { status: 500 });
      }

      const bothSigned = Boolean(updated.founder_accepted_at && updated.team_accepted_at);

      await addMessage({
        conversation_id: agreement.conversation_id,
        sender_type: 'ai',
        sender_name: 'BrandForge',
        content: bothSigned
          ? 'Both sides accepted the contract. It is signed — fund escrow to start the project.'
          : `Contract accepted by ${isOwner ? 'the founder' : 'the BrandForge team'}. Waiting for ${
              isOwner ? 'the team' : 'the founder'
            } to accept.`,
        content_type: 'system',
        artifact_data: { type: 'agreement', id: agreementId, status: updated.status },
      });

      if (bothSigned) {
        await recordFunnelEvent('contract_signed', {
          signedIn: true,
          properties: { total_amount: Number(updated.total_amount) || 0, stage: 'agree' },
        });
        await notify('contract_signed', {});
        await notifyFounder(agreement.conversation_id, 'contract_signed', {});
        // Staff-only: the public "matched and funded" line waits for escrow
        // verification, so the public feed never claims funding prematurely.
        await postOpsEvent('contract_signed', {
          totalAmount: updated.total_amount,
          currency: updated.currency,
        });
      } else if (isOwner) {
        // Founder signed first: the team's accept is now the only thing left.
        await notify('contract_accepted', { side: 'founder' });
      } else {
        // Team signed first: nag the founder personally — linked Telegram and/or
        // email, whichever they have (unlinked on both is a silent no-op).
        await notifyFounder(agreement.conversation_id, 'contract_accepted', { side: 'team' });
      }

      return NextResponse.json({ success: true, agreement: updated, bothSigned });
    }

    // ---- Contract revision: edit the terms; both prior signatures are cleared. ----
    if (typeof terms === 'string') {
      const decision = canEditAgreementTerms({ actor, ownerId });
      if (!decision.allowed) {
        return NextResponse.json({ error: decision.reason }, { status: decision.status });
      }

      const text = terms.trim();
      if (!text || text.length > 8000) {
        return NextResponse.json(
          { error: 'Contract terms must be between 1 and 8,000 characters' },
          { status: 400 }
        );
      }

      if (agreement.status !== 'pending_funding') {
        return NextResponse.json(
          { error: 'Only a contract awaiting funding can be revised' },
          { status: 409 }
        );
      }

      const updated = await updateAgreementTerms(agreementId, text, user.id);
      if (!updated) {
        return NextResponse.json({ error: 'Failed to update the contract' }, { status: 500 });
      }

      await addMessage({
        conversation_id: agreement.conversation_id,
        sender_type: 'ai',
        sender_name: 'BrandForge',
        content: `Contract terms updated by ${
          isOwner ? 'the founder' : 'the team'
        }. Both sides must accept the revised contract before funding.`,
        content_type: 'system',
        artifact_data: { type: 'agreement', id: agreementId, status: updated.status },
      });

      return NextResponse.json({ success: true, agreement: updated });
    }

    if (!status) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Agreement lifecycle is staff work. 'funded' is never set here: funding only happens
    // through /api/payments after the client's crypto transfer is verified on-chain.
    // Shared, unit-tested decision (lib/money-authz.js).
    const decision = canUpdateAgreement({ actor, status });

    if (!decision.allowed) {
      return NextResponse.json({ error: decision.reason }, { status: decision.status });
    }

    const updatedStatus = await updateAgreementStatus(agreementId, status);

    if (!updatedStatus) {
      return NextResponse.json({ error: 'Failed to update agreement' }, { status: 500 });
    }

    return NextResponse.json({ success: true, agreement: updatedStatus });
  } catch (error) {
    console.error('Update agreement API error:', error);
    return NextResponse.json(
      { error: 'Failed to update agreement' },
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
      { error: 'Failed to get agreement' },
      { status: 500 }
    );
  }
}
