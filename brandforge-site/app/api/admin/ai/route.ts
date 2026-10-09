import { NextRequest, NextResponse } from 'next/server';
import { answerModel, getLiveModelIds } from '@/lib/ai-service';
import { describeModels } from '@/lib/model-catalog.js';
import { budgetLimits } from '@/lib/ai-budget.js';
import { getAiUsageToday, getFunnelSummary, getReturnMetrics, isAdminAccount } from '@/lib/project-db';
import { getAuthenticatedUser } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

// The visitor journey, in the order people move through it. Labels are plain language.
const JOURNEY: [string, string][] = [
  ['landing_viewed', 'Opened the site'],
  ['chat_started', 'Started a chat'],
  ['guest_send_gated', 'Asked to sign in first (gate, currently off)'],
  ['guest_save_clicked', 'Tapped sign in after an answer'],
  ['signin_started', 'Started signing in'],
  ['onboarding_completed', 'Finished onboarding'],
  ['session_returned', 'Came back on a later day'],
  ['bot_continue_clicked', 'Moved from Telegram or Discord to the web'],
];

// GET /api/admin/ai: models by provider (available vs not yet), spend guard state, the journey and
// the 7-day return rate. Admin only.
export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request).catch(() => null);
    if (!user) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (!(await isAdminAccount(user.id))) return NextResponse.json({ error: 'Admin access only' }, { status: 403 });

    const [live, usage, funnel, returns] = await Promise.all([getLiveModelIds(), getAiUsageToday(null), getFunnelSummary(), getReturnMetrics()]);
    const answering = await answerModel();
    return NextResponse.json({
      answering,
      fastModel: process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini',
      liveListRead: live !== null,
      models: describeModels(live),
      limits: budgetLimits(process.env),
      aiToday: usage.aiToday,
      journey: JOURNEY.map(([event, label]) => ({ event, label, count: funnel?.counts.get(event) ?? 0 })),
      returns,
    });
  } catch (error) {
    console.error('Admin AI error:', error);
    return NextResponse.json({ error: 'Failed to load AI details' }, { status: 500 });
  }
}
