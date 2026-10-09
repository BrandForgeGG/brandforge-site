import { NextRequest, NextResponse } from 'next/server';
import {
  getPeerContract,
  getProfileDisplayName,
  isAdminAccount,
  peerRowToContract,
  savePeerContract,
} from '@/lib/project-db';
import { announce, settleIfDue } from '@/lib/peer-contract-service';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { toPeerView } from '@/lib/peer-contract-view';
import { applyAction, sideOf } from '@/lib/peer-contract.js';
import { checkRateLimit } from '@/lib/rate-limit';

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
  'respond_dispute',
  'resolve_dispute',
  'mark_paid',
]);

type RouteContext = { params: Promise<{ id: string }> };

async function authorize(request: NextRequest, id: string) {
  const user = await getAuthenticatedUser(request);
  if (!user) return { error: NextResponse.json({ error: 'Sign in to open this contract' }, { status: 401 }) } as const;

  const found = await getPeerContract(id);
  if (!found.ok) {
    const status = found.error === 'not_found' ? 404 : found.error === 'pending_migration' ? 503 : 500;
    return { error: NextResponse.json({ error: 'Contract not found' }, { status }) } as const;
  }

  const isStaff = await isAdminAccount(user.id);
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
    await announce(saved.row, result.event, { id: auth.user.id, name: actorName }, { reason: String(body.reason ?? body.response ?? ''), index: Number(body.index) });

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
