import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { getAgreementById, getConversation, recordFunnelEvent } from '@/lib/project-db';
import { createTaskCheckoutUrl } from '@/lib/stripe';
import { paymentStatus } from '@/lib/payments-open';
import { checkRateLimit } from '@/lib/rate-limit';
import { resolveSiteUrl } from '@/lib/auth-utils';

export const dynamic = 'force-dynamic';

// POST { agreementId }: the buyer pays a funded task by card. Only the chat's owner, only while it waits for funding.
export async function POST(request: NextRequest) {
  const status = paymentStatus();
  if (!status.card) return NextResponse.json({ error: status.crypto ? 'Card payments are not connected yet. Pay with crypto instead.' : 'Payments open soon.' }, { status: 503 });
  const user = await getAuthenticatedUser(request).catch(() => null);
  if (!user) return NextResponse.json({ error: 'Sign in to fund the task.', code: 'auth' }, { status: 401 });
  if (!checkRateLimit(`task-checkout:${user.id}`, { limit: 10, windowMs: 60 * 60 * 1000 }).allowed) return NextResponse.json({ error: 'Too many attempts. Try again later.' }, { status: 429 });
  const body = (await request.json().catch(() => ({}))) as { agreementId?: unknown };
  const agreementId = String(body.agreementId ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(agreementId)) return NextResponse.json({ error: 'Invalid task' }, { status: 400 });
  const agreement = await getAgreementById(agreementId);
  if (!agreement) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  const chat = await getConversation(agreement.conversation_id);
  if (!chat || chat.user_id !== user.id) return NextResponse.json({ error: 'Only the buyer can fund this task.' }, { status: 403 });
  if (agreement.status !== 'pending_funding') return NextResponse.json({ error: 'This task is already funded.' }, { status: 409 });
  const url = await createTaskCheckoutUrl({ agreementId, cents: Math.round(Number(agreement.total_amount) * 100), title: String(chat.title ?? 'Task'), userId: user.id, email: user.email ?? null, origin: resolveSiteUrl(), chatId: agreement.conversation_id });
  if (!url) return NextResponse.json({ error: status.crypto ? 'Card payment could not start right now. Try again, or pay with crypto.' : 'Card payment could not start right now. Try again in a moment.' }, { status: 502 });
  await recordFunnelEvent('checkout_started', { signedIn: true, properties: { source: 'task' } });
  return NextResponse.json({ url });
}
