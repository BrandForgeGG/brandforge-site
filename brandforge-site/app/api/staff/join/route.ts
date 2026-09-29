import { NextRequest, NextResponse } from 'next/server';
import { canOperatorParticipate, ensureStaffParticipant, requireStaffContext } from '@/lib/staff';
import { checkRateLimit } from '@/lib/rate-limit';

const STAFF_JOIN_RATE_LIMIT = { limit: 20, windowMs: 60 * 60 * 1000 };

export const dynamic = 'force-dynamic';

// Join a conversation as BrandForge staff (operator). Adds the participant row and leaves a
// join message in the founder's chat. Operators join only through their accepted proposal;
// admins join freely (journey spec).
export async function POST(request: NextRequest) {
  try {
    let body: { conversationId?: string } = {};

    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const context = await requireStaffContext(String(body.conversationId ?? ''), request);

    if (context instanceof NextResponse) {
      return context;
    }

    if (context.role === 'founder') {
      return NextResponse.json({ error: 'You already own this conversation' }, { status: 400 });
    }

    if (!(await canOperatorParticipate(context))) {
      return NextResponse.json(
        { error: 'Operators join a chat when their proposal is accepted.' },
        { status: 403 }
      );
    }

    const rate = checkRateLimit(`staff-join:${context.user.id}`, STAFF_JOIN_RATE_LIMIT);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'Too many requests — please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } }
      );
    }

    const joined = await ensureStaffParticipant(context);

    if (!joined) {
      return NextResponse.json({ error: 'Could not join the conversation' }, { status: 500 });
    }

    return NextResponse.json({ success: true, role: 'operator' });
  } catch (error) {
    console.error('Staff join API error:', error);
    return NextResponse.json(
      { error: 'Failed to join' },
      { status: 500 }
    );
  }
}
