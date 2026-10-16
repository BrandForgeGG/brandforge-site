import { after, NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { addMessage, getConversation, isStaffAccount } from '@/lib/project-db';
import { getRetainer } from '@/lib/plans.js';
import { notifyFounder } from '@/lib/stage-notify';
import { checkRateLimit } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

// POST { plan }: once the client and the team agreed a monthly plan in this chat, a staff member sends the invoice here.
// The client pays from the card (card or crypto); the payment marks it Paid and starts month 1 in this chat.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser(request).catch(() => null);
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  if (!(await isStaffAccount(user.id))) return NextResponse.json({ error: 'Only the BrandForge team can send an invoice.' }, { status: 403 });
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Invalid chat' }, { status: 400 });
  if (!checkRateLimit(`plan-invoice:${user.id}`, { limit: 20, windowMs: 60 * 60 * 1000 }).allowed) return NextResponse.json({ error: 'Too many invoices. Try again later.' }, { status: 429 });
  const body = (await request.json().catch(() => ({}))) as { plan?: unknown };
  const plan = getRetainer(String(body.plan ?? ''));
  if (!plan) return NextResponse.json({ error: 'Pick Launch, Growth or Scale.' }, { status: 400 });
  const chat = await getConversation(id);
  if (!chat) return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
  if (chat.user_id === user.id) return NextResponse.json({ error: 'Send it in a client chat, not your own.' }, { status: 400 });

  const messageId = await addMessage({
    conversation_id: id,
    sender_type: 'human_operator',
    sender_id: user.id,
    sender_name: 'BrandForge',
    content: `Invoice: ${plan.name}, ${plan.price}${plan.cadence}. Pay below to start.`,
    content_type: 'system',
    artifact_data: { type: 'plan_invoice', id: plan.id, status: 'open' },
  });
  if (!messageId) return NextResponse.json({ error: 'Could not send it. Try again.' }, { status: 502 });
  after(() => notifyFounder(id, 'plan_invoice', { title: plan.name, price: `${plan.price}${plan.cadence}` }).then(() => undefined));
  return NextResponse.json({ ok: true, messageId });
}
