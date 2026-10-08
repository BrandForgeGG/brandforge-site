import { NextRequest, NextResponse } from 'next/server';
import {
  addMessage,
  canAccessConversation,
  createPeerContract,
  getProfileDisplayName,
  isStaffAccount,
  listConversationPeople,
  listPeerContractsFor,
  recordFunnelEvent,
} from '@/lib/project-db';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { toPeerView } from '@/lib/peer-contract-view';
import { feePercent, validateDraft } from '@/lib/peer-contract.js';
import { screenText } from '@/lib/content-policy.js';
import { checkRateLimit } from '@/lib/rate-limit';
import { postOpsEvent } from '@/lib/ops-events';

export const dynamic = 'force-dynamic';

const CREATE_LIMIT = { limit: 15, windowMs: 60 * 60 * 1000 };

const PENDING = { error: 'Contracts are being set up. Try again shortly.', pending: true };

// GET /api/peer-contracts?conversationId=…&people=1  -> who in this chat can be on a contract
// GET /api/peer-contracts                            -> every contract the caller is part of
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Sign in to use contracts' }, { status: 401 });

    const conversationId = request.nextUrl.searchParams.get('conversationId');
    if (request.nextUrl.searchParams.get('people') && conversationId) {
      if (!(await canAccessConversation(user.id, conversationId))) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }
      const people = (await listConversationPeople(conversationId)).filter((p) => p.userId !== user.id);
      return NextResponse.json({ people, feePercent: feePercent() });
    }

    const result = await listPeerContractsFor(user.id);
    if (!result.ok) {
      if (result.error === 'pending_migration') return NextResponse.json({ contracts: [], pending: true });
      return NextResponse.json({ error: 'Could not load contracts' }, { status: 500 });
    }
    const isStaff = await isStaffAccount(user.id);
    const contracts = await Promise.all(result.rows.map((row) => toPeerView(row, user.id, isStaff)));
    return NextResponse.json({ contracts });
  } catch (error) {
    console.error('Peer contracts list error:', error);
    return NextResponse.json({ error: 'Could not load contracts' }, { status: 500 });
  }
}

// POST creates a contract proposal between the caller and one other person in the chat.
// The proposer signs by proposing; the other side accepts or edits the terms.
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) return NextResponse.json({ error: 'Sign in to create a contract' }, { status: 401 });

    const body = await request.json().catch(() => ({}));
    const conversationId = String(body.conversationId ?? '');
    const counterpartyId = String(body.counterpartyId ?? '');
    const myRole = body.myRole === 'payee' ? 'payee' : 'payer';

    if (!conversationId || !counterpartyId) {
      return NextResponse.json({ error: 'Pick who the contract is with.' }, { status: 400 });
    }
    if (!(await canAccessConversation(user.id, conversationId))) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const rate = checkRateLimit(`peer-contracts:${user.id}`, CREATE_LIMIT);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'Too many contracts in a short time. Try again later.' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } },
      );
    }

    const people = await listConversationPeople(conversationId);
    if (counterpartyId === user.id || !people.some((p) => p.userId === counterpartyId)) {
      return NextResponse.json({ error: 'That person is not in this chat.' }, { status: 400 });
    }

    const draft = validateDraft(body);
    if (!draft.ok) return NextResponse.json({ error: draft.error }, { status: 400 });

    const screened = screenText(`${draft.value.title}\n${draft.value.scope}`);
    if (!screened.ok) return NextResponse.json({ error: screened.message, policy: screened.category }, { status: 422 });

    const created = await createPeerContract({
      conversationId,
      createdBy: user.id,
      payerId: myRole === 'payer' ? user.id : counterpartyId,
      payeeId: myRole === 'payee' ? user.id : counterpartyId,
      title: draft.value.title,
      scope: draft.value.scope,
      currency: draft.value.currency,
      totalCents: draft.value.totalCents,
      dueDate: draft.value.dueDate,
      milestones: draft.value.milestones,
      feePercent: feePercent(),
    });
    if (!created.ok) {
      if (created.error === 'pending_migration') return NextResponse.json(PENDING, { status: 503 });
      return NextResponse.json({ error: 'Could not create the contract' }, { status: 500 });
    }

    const [myName, theirName] = await Promise.all([
      getProfileDisplayName(user.id),
      getProfileDisplayName(counterpartyId),
    ]);
    await addMessage({
      conversation_id: conversationId,
      sender_type: 'ai',
      sender_name: 'BrandForge',
      content: `${myName} proposed a contract to ${theirName}: ${draft.value.title}. Review the terms and accept to sign.`,
      content_type: 'system',
      artifact_data: { type: 'peer_contract', id: created.row.id, status: created.row.status },
    });

    await recordFunnelEvent('peer_contract_proposed', {
      signedIn: true,
      properties: { total_amount: Math.round(draft.value.totalCents / 100), stage: 'agree' },
    });
    await postOpsEvent('contract_proposed', {
      title: draft.value.title,
      totalAmount: draft.value.totalCents / 100,
      currency: draft.value.currency,
      conversationId,
      milestoneCount: draft.value.milestones.length,
    });

    const isStaff = await isStaffAccount(user.id);
    return NextResponse.json({ success: true, contract: await toPeerView(created.row, user.id, isStaff) });
  } catch (error) {
    console.error('Peer contract create error:', error);
    return NextResponse.json({ error: 'Could not create the contract' }, { status: 500 });
  }
}
