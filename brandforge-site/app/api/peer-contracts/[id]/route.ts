import { NextRequest, NextResponse } from 'next/server';
import {
  addMessage,
  getPeerContract,
  getProfileDisplayName,
  isStaffAccount,
  peerRowToContract,
  recordFunnelEvent,
  savePeerContract,
  type PeerContractRow,
} from '@/lib/project-db';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { toPeerView } from '@/lib/peer-contract-view';
import { applyAction, formatMoney, settleDue, sideOf } from '@/lib/peer-contract.js';
import { checkRateLimit } from '@/lib/rate-limit';
import { postOpsEvent } from '@/lib/ops-events';

export const dynamic = 'force-dynamic';

const ACTION_LIMIT = { limit: 60, windowMs: 60 * 60 * 1000 };
const ACTIONS = new Set([
  'accept',
  'revise',
  'cancel',
  'submit_funding',
  'verify_funding',
  'submit_milestone',
  'approve_milestone',
  'dispute_milestone',
  'resolve_dispute',
]);

type RouteContext = { params: Promise<{ id: string }> };

// Auto-release is applied lazily: whoever opens the contract after the 48-hour window
// triggers the settlement, and the payout line reaches staff at that moment.
async function settleIfDue(row: PeerContractRow): Promise<PeerContractRow> {
  const contract = peerRowToContract(row);
  const settled = settleDue(contract, new Date(), contract.feePercent);
  if (settled === contract) return row;

  const saved = await savePeerContract(row.id, settled, row.updated_at);
  if (!saved.ok) return row;

  const released = settled.milestones.filter(
    (m: { status: string }, i: number) => m.status === 'released' && contract.milestones[i].status === 'submitted',
  );
  for (const m of released as { amountCents: number; feeCents: number }[]) {
    await postOpsEvent('peer_released', {
      title: settled.title,
      totalAmount: (m.amountCents - m.feeCents) / 100,
      currency: settled.currency,
      feeLabel: formatMoney(m.feeCents, settled.currency),
      conversationId: row.conversation_id,
    });
  }
  await addMessage({
    conversation_id: row.conversation_id,
    sender_type: 'ai',
    sender_name: 'BrandForge',
    content: `A milestone on "${settled.title}" was released automatically after 48 hours with no objection.`,
    content_type: 'system',
  });
  return saved.row;
}

async function authorize(request: NextRequest, id: string) {
  const user = await getAuthenticatedUser(request);
  if (!user) return { error: NextResponse.json({ error: 'Sign in to open this contract' }, { status: 401 }) } as const;

  const found = await getPeerContract(id);
  if (!found.ok) {
    const status = found.error === 'not_found' ? 404 : found.error === 'pending_migration' ? 503 : 500;
    return { error: NextResponse.json({ error: 'Contract not found' }, { status }) } as const;
  }

  const isStaff = await isStaffAccount(user.id);
  const contract = peerRowToContract(found.row);
  // Only the two parties (and staff) see terms and money; the rest of the chat sees a card shell.
  if (!sideOf(contract, user.id) && !isStaff) {
    return { error: NextResponse.json({ error: 'This contract is private to the two people on it.' }, { status: 403 }) } as const;
  }
  return { user, isStaff, row: found.row } as const;
}

export async function GET(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const auth = await authorize(request, id);
    if ('error' in auth) return auth.error;
    const row = await settleIfDue(auth.row);
    return NextResponse.json({ contract: await toPeerView(row, auth.user.id, auth.isStaff) });
  } catch (error) {
    console.error('Peer contract read error:', error);
    return NextResponse.json({ error: 'Could not load the contract' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const { id } = await params;
    const auth = await authorize(request, id);
    if ('error' in auth) return auth.error;

    const rate = checkRateLimit(`peer-actions:${auth.user.id}`, ACTION_LIMIT);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Try again in a moment.' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } },
      );
    }

    const body = await request.json().catch(() => ({}));
    const action = typeof body.action === 'string' ? body.action : '';
    if (!ACTIONS.has(action)) return NextResponse.json({ error: 'Unknown action' }, { status: 400 });

    // Time-based settlement first, so an action never runs against a stale state.
    const row = await settleIfDue(auth.row);
    const contract = peerRowToContract(row);

    const result = applyAction(
      contract,
      action,
      { userId: auth.user.id, isStaff: auth.isStaff },
      body,
      new Date(),
      contract.feePercent,
    );
    if (!result.ok) return NextResponse.json({ error: result.reason }, { status: result.status });

    const saved = await savePeerContract(id, result.contract, row.updated_at);
    if (!saved.ok) {
      const conflict = saved.error === 'conflict';
      return NextResponse.json(
        { error: conflict ? 'This contract just changed. Refresh and try again.' : 'Could not save the change' },
        { status: conflict ? 409 : 500 },
      );
    }

    const actorName = await getProfileDisplayName(auth.user.id);
    await announce(saved.row, result.event, actorName, body);

    return NextResponse.json({
      success: true,
      event: result.event,
      contract: await toPeerView(saved.row, auth.user.id, auth.isStaff),
    });
  } catch (error) {
    console.error('Peer contract action error:', error);
    return NextResponse.json({ error: 'Could not update the contract' }, { status: 500 });
  }
}

const LINES: Record<string, (who: string, title: string) => string> = {
  accepted: (who, title) => `${who} accepted "${title}". Waiting for the other person to accept.`,
  signed: (_who, title) => `Both people accepted "${title}". The payer can fund it now.`,
  revised: (who, title) => `${who} changed the terms of "${title}". Both people need to accept again.`,
  cancelled: (who, title) => `${who} withdrew "${title}".`,
  funding_submitted: (who, title) => `${who} submitted a deposit for "${title}". It is being checked.`,
  funded: (_who, title) => `The deposit for "${title}" is confirmed. Work can start.`,
  funding_rejected: (_who, title) => `The deposit for "${title}" could not be confirmed. The payer can send the reference again.`,
  submitted: (who, title) => `${who} submitted work on "${title}". The payer has 48 hours to approve or raise an issue.`,
  released: (_who, title) => `A milestone on "${title}" was released.`,
  disputed: (who, title) => `${who} raised an issue on "${title}". A person from BrandForge will review it.`,
  refunded: (_who, title) => `A milestone on "${title}" was refunded after review.`,
};

async function announce(row: PeerContractRow, event: string, actorName: string, body: Record<string, unknown>) {
  const contract = peerRowToContract(row);
  const line = LINES[event];
  if (line) {
    await addMessage({
      conversation_id: row.conversation_id,
      sender_type: 'ai',
      sender_name: 'BrandForge',
      content: line(actorName, contract.title),
      content_type: 'system',
    });
  }

  const common = { title: contract.title, currency: contract.currency, conversationId: row.conversation_id };
  if (event === 'signed') {
    await recordFunnelEvent('peer_contract_signed', {
      signedIn: true,
      properties: { total_amount: Math.round(contract.totalCents / 100), stage: 'agree' },
    });
    await postOpsEvent('contract_signed', { ...common, totalAmount: contract.totalCents / 100 });
  } else if (event === 'funding_submitted') {
    await postOpsEvent('peer_funding_review', { ...common, totalAmount: contract.totalCents / 100 });
  } else if (event === 'disputed') {
    await postOpsEvent('peer_dispute', { ...common, reason: String(body.reason ?? '') });
  } else if (event === 'released') {
    const index = Number(body.index);
    const m = contract.milestones[index];
    if (m) {
      await recordFunnelEvent('peer_contract_released', {
        signedIn: true,
        properties: { total_amount: Math.round(m.amountCents / 100), stage: 'deliver' },
      });
      await postOpsEvent('peer_released', {
        ...common,
        totalAmount: (m.amountCents - m.feeCents) / 100,
        feeLabel: formatMoney(m.feeCents, contract.currency),
      });
    }
  }
}
