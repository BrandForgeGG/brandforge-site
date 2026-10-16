import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { getTeamDashboard, isStaffAccount } from '@/lib/project-db';
import { getRetainer } from '@/lib/plans.js';
import { TEAM_SHARE, CHATS_PER_CLIENT, goalMix, pathToGoal, planSplits, split } from '@/lib/team-economics.js';

export const dynamic = 'force-dynamic';

// GET: the shared team dashboard, for everyone on the BrandForge team (operators and admins).
export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request).catch(() => null);
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 });
  if (!(await isStaffAccount(user.id))) return NextResponse.json({ error: 'For the BrandForge team only.' }, { status: 403 });
  const data = await getTeamDashboard();
  if (!data) return NextResponse.json({ error: 'Not available right now.' }, { status: 503 });

  const clients = data.clients.map((client) => {
    const cents = getRetainer(client.plan)?.cents ?? 0;
    return { ...client, cents, ...split(cents) };
  });
  const teamCents = clients.reduce((sum, client) => sum + client.cents, 0);
  const mrr = teamCents + data.software.cents;
  // What each lead's clients pay the team per month (the lead shares it with whoever they bring into the work).
  const byLead = new Map<string, { name: string; cents: number; clients: number }>();
  for (const client of clients) {
    const key = client.leadId ?? 'none';
    const row = byLead.get(key) ?? { name: client.lead ?? 'Nobody yet: claim the chat', cents: 0, clients: 0 };
    row.cents += client.team;
    row.clients += 1;
    byLead.set(key, row);
  }
  return NextResponse.json(
    {
      mrr,
      teamCents,
      software: data.software,
      split: { team: clients.reduce((sum, c) => sum + c.team, 0), brandforge: clients.reduce((sum, c) => sum + c.brandforge, 0) + data.software.cents },
      teamShare: TEAM_SHARE,
      chatsPerClient: CHATS_PER_CLIENT,
      path: pathToGoal(mrr),
      goalMix: goalMix(),
      plans: planSplits(),
      clients,
      earnings: [...byLead.values()].sort((a, b) => b.cents - a.cents),
      openInvoices: data.openInvoices,
      cancelled30d: data.cancelled30d,
      invoices30d: data.invoices30d,
    },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
