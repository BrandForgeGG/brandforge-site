import { NextRequest, NextResponse } from 'next/server';
import {
  getAgreementById,
  getConversationOwnerId,
  submitAgreementFunding,
  verifyAgreementFunding,
  rejectAgreementFunding,
  releasePaymentToOperator,
  addMessage,
  isStaffAccount,
  recordFunnelEvent,
} from '@/lib/project-db';
import { getAuthenticatedUser } from '@/lib/supabase-server';
// lib/crypto-payments.js is dependency-free CommonJS so node:test can run it without a build.
import {
  isValidTxHash,
  isValidNetwork,
  normalizeNetwork,
  normalizeTxHash,
} from '@/lib/crypto-payments';
import { notify } from '@/lib/notify';
import { notifyFounder } from '@/lib/stage-notify';
import { postOpsEvent, postPublicActivity } from '@/lib/ops-events';
import { canSubmitFunding } from '@/lib/money-authz.js';
import { checkRateLimit } from '@/lib/rate-limit';

const PAYMENTS_RATE_LIMIT = { limit: 30, windowMs: 60 * 60 * 1000 };

export const dynamic = 'force-dynamic';

function systemMessage(conversationId: string, content: string, artifactData?: Record<string, unknown>) {
  return addMessage({
    conversation_id: conversationId,
    sender_type: 'ai',
    sender_name: 'BrandForge',
    content,
    content_type: 'system',
    ...(artifactData ? { artifact_data: artifactData } : {}),
  });
}

// Founder submits the transaction hash for the full agreement funding. The money stays
// 'pending' until BrandForge staff confirm the transfer on-chain via PATCH verify.
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json();
    const { agreementId } = body;
    const txHash = normalizeTxHash(body?.txHash);
    const network = normalizeNetwork(body?.network);

    if (!agreementId || !txHash) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (!isValidTxHash(txHash)) {
      return NextResponse.json({ error: 'Invalid transaction hash' }, { status: 400 });
    }

    if (network && !isValidNetwork(network)) {
      return NextResponse.json({ error: 'Invalid network label' }, { status: 400 });
    }

    const agreement = await getAgreementById(agreementId);
    if (!agreement) {
      return NextResponse.json({ error: 'Agreement not found' }, { status: 404 });
    }

    // Funding evidence can only come from the founder who owns the conversation — staff included,
    // because they verify on-chain but never submit the transfer.
    // Shared, unit-tested decision (lib/money-authz.js).
    const ownerId = await getConversationOwnerId(agreement.conversation_id);
    const isStaff = await isStaffAccount(user.id);
    const decision = canSubmitFunding({ actor: { userId: user.id, isStaff }, ownerId });

    if (!decision.allowed) {
      return NextResponse.json({ error: decision.reason }, { status: decision.status });
    }

    // Throttled after authorization so rejected callers keep their diagnostic status
    // instead of burning quota on doomed requests.
    const submitRate = checkRateLimit(`payments:${user.id}`, PAYMENTS_RATE_LIMIT);
    if (!submitRate.allowed) {
      return NextResponse.json(
        { error: 'Too many requests — please try again later.' },
        { status: 429, headers: { 'Retry-After': String(submitRate.retryAfterSeconds) } }
      );
    }

    if (agreement.status !== 'pending_funding') {
      return NextResponse.json(
        { error: 'This agreement is not awaiting funding' },
        { status: 409 }
      );
    }

    const recorded = await submitAgreementFunding(
      agreementId,
      txHash,
      network || process.env.NEXT_PUBLIC_DEPOSIT_NETWORK || null
    );

    if (!recorded) {
      return NextResponse.json(
        { error: 'Funding was already submitted or no payment schedule exists yet' },
        { status: 409 }
      );
    }

    await systemMessage(
      agreement.conversation_id,
      `Payment submitted for verification. BrandForge is confirming the transfer on-chain (tx ${txHash}). The project moves to delivery as soon as it checks out.`,
      { type: 'funding', id: agreementId, status: 'verifying' }
    );

    // The founder submitted real evidence, so this is a genuine funding step. The tx hash itself is
    // deliberately not recorded — only the network label.
    await recordFunnelEvent('funding_submitted', {
      signedIn: true,
      properties: { network: network ?? '', total_amount: agreement.total_amount, stage: 'fund' },
    });

    await notify('payment_submitted', {
      txHash,
      network: network || process.env.NEXT_PUBLIC_DEPOSIT_NETWORK || null,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Submit payment API error:', error);
    return NextResponse.json(
      { error: 'Failed to submit payment' },
      { status: 500 }
    );
  }
}

// Staff actions on money: verify the funding transfer on-chain, reject it with a reason, or
// release one held milestone payment to the operator after founder approval.
export async function PATCH(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const isStaff = await isStaffAccount(user.id);
    if (!isStaff) {
      return NextResponse.json(
        { error: 'Only BrandForge staff can manage payments' },
        { status: 403 }
      );
    }

    // Shared bucket with funding submits: staff verifications are rare.
    const manageRate = checkRateLimit(`payments:${user.id}`, PAYMENTS_RATE_LIMIT);
    if (!manageRate.allowed) {
      return NextResponse.json(
        { error: 'Too many requests — please try again later.' },
        { status: 429, headers: { 'Retry-After': String(manageRate.retryAfterSeconds) } }
      );
    }

    const body = await request.json();
    const { action, agreementId, paymentId } = body;
    const note = typeof body?.note === 'string' ? body.note.trim() : '';

    if (action === 'verify' || action === 'reject') {
      if (!agreementId) {
        return NextResponse.json({ error: 'agreementId required' }, { status: 400 });
      }

      const agreement = await getAgreementById(agreementId);
      if (!agreement) {
        return NextResponse.json({ error: 'Agreement not found' }, { status: 404 });
      }

      if (action === 'verify') {
        if (agreement.status !== 'pending_funding') {
          return NextResponse.json(
            { error: 'This agreement is not awaiting funding' },
            { status: 409 }
          );
        }

        const result = await verifyAgreementFunding(agreementId);
        if (!result) {
          return NextResponse.json({ error: 'Failed to verify funding' }, { status: 500 });
        }

        await systemMessage(
          result.conversationId,
          'Payment verified on-chain. The project is funded and delivery starts now. BrandForge holds the funds and releases each milestone payment after the founder approves the delivered work.',
          { type: 'funding', id: agreementId, status: 'funded' }
        );

        // Verified means the money actually arrived on-chain.
        await recordFunnelEvent('funding_verified', {
          signedIn: true,
          properties: { total_amount: agreement.total_amount, stage: 'deliver' },
        });

        await notify('payment_verified', { conversationId: agreement.conversation_id });

        await notifyFounder(agreement.conversation_id, 'funding_verified', {});

        // Verified money is the moment the public feed may claim funding: the
        // staff embed carries the amount, the public line stays outcome-only.
        await postOpsEvent('escrow_funded', {
          totalAmount: agreement.total_amount,
          currency: agreement.currency,
          conversationId: agreement.conversation_id,
        });
        await postPublicActivity('contract_funded');

        return NextResponse.json({ success: true });
      }

      const rejected = await rejectAgreementFunding(agreementId);
      if (!rejected) {
        return NextResponse.json({ error: 'Failed to reject funding' }, { status: 500 });
      }

      await systemMessage(
        agreement.conversation_id,
        `The submitted payment could not be verified${note ? `: ${note}` : ''}. Please check the amount and network, then resubmit the transaction hash.`,
        { type: 'funding', id: agreementId, status: 'failed' }
      );

      await notify('payment_rejected', { note, conversationId: agreement.conversation_id });

      await notifyFounder(agreement.conversation_id, 'funding_rejected', { note });

      // Closest thing to a dispute signal pre-dispute: staff disputes channel.
      await postOpsEvent('escrow_rejected', { note, conversationId: agreement.conversation_id });

      return NextResponse.json({ success: true });
    }

    if (action === 'release') {
      if (!paymentId) {
        return NextResponse.json({ error: 'paymentId required' }, { status: 400 });
      }

      const released = await releasePaymentToOperator(paymentId);
      if (!released) {
        return NextResponse.json(
          { error: 'Payment not found or not currently held' },
          { status: 409 }
        );
      }

      await systemMessage(
        released.conversation_id,
        `Milestone payment "${released.title}" (${released.currency} ${Number(released.amount).toLocaleString()}) released to the operator.`,
        { type: 'funding', id: agreementId, paymentId, status: 'released' }
      );

      // Money actually moved to the operator. This is the last step of the escrow loop.
      await recordFunnelEvent('payment_released', {
        signedIn: true,
        properties: { amount: released.amount, currency: released.currency, stage: 'deliver' },
      });

      await notify('payment_released', {
        title: released.title,
        amount: released.amount,
        currency: released.currency,
        conversationId: released.conversation_id,
      });

      await notifyFounder(released.conversation_id, 'payment_released', {
        title: released.title,
        amount: released.amount,
        currency: released.currency,
      });

      await postOpsEvent('milestone_released', {
        title: released.title,
        amount: released.amount,
        currency: released.currency,
        conversationId: released.conversation_id,
      });
      await postPublicActivity('milestone_released');

      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Invalid payment action' }, { status: 400 });
  } catch (error) {
    console.error('Manage payment API error:', error);
    return NextResponse.json(
      { error: 'Failed to manage payment' },
      { status: 500 }
    );
  }
}

