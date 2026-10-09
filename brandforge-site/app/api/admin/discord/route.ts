import { NextRequest, NextResponse } from 'next/server';
import { isAdminAccount } from '@/lib/project-db';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { COMMAND, applicationIdFromToken, inviteUrl } from '@/lib/discord-commands.js';

export const dynamic = 'force-dynamic';

async function requireAdmin(request: NextRequest) {
  const user = await getAuthenticatedUser(request).catch(() => null);
  if (!user) return { error: NextResponse.json({ error: 'Authentication required' }, { status: 401 }) } as const;
  if (!(await isAdminAccount(user.id))) return { error: NextResponse.json({ error: 'Admin access only' }, { status: 403 }) } as const;
  return { user } as const;
}

type DiscordCommand = { id: string; name: string };

async function listCommands(applicationId: string, token: string): Promise<DiscordCommand[] | null> {
  try {
    const res = await fetch(`https://discord.com/api/v10/applications/${applicationId}/commands`, {
      headers: { Authorization: `Bot ${token}` },
      signal: AbortSignal.timeout(10000),
    });
    return res.ok ? ((await res.json()) as DiscordCommand[]) : null;
  } catch {
    return null;
  }
}

// GET: what is set up and what is missing, in plain terms. Never returns a secret.
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('error' in auth) return auth.error;
  const token = String(process.env.DISCORD_BOT_TOKEN ?? '').trim();
  const applicationId = applicationIdFromToken(token);
  const commands = token ? await listCommands(applicationId, token) : null;
  return NextResponse.json({
    hasToken: Boolean(token),
    hasPublicKey: Boolean(String(process.env.DISCORD_PUBLIC_KEY ?? '').trim()),
    applicationId: applicationId || null,
    commandRegistered: commands ? commands.some((c) => c.name === COMMAND.name) : null,
    tokenAccepted: token ? commands !== null : null,
    inviteUrl: applicationId ? inviteUrl(applicationId) : null,
    endpointUrl: 'https://brandforge.gg/api/discord/interactions',
  });
}

// POST: register (or update) the /brandforge command. Replaces the application's global commands
// with ours, so the picker never shows a stale or duplicate entry.
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if ('error' in auth) return auth.error;
  const token = String(process.env.DISCORD_BOT_TOKEN ?? '').trim();
  const applicationId = applicationIdFromToken(token);
  if (!token || !applicationId) return NextResponse.json({ error: 'DISCORD_BOT_TOKEN is not set in Vercel.' }, { status: 400 });

  try {
    const res = await fetch(`https://discord.com/api/v10/applications/${applicationId}/commands`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bot ${token}` },
      body: JSON.stringify([COMMAND]),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const detail = (await res.text()).slice(0, 300);
      return NextResponse.json({ error: res.status === 401 ? 'Discord rejected the bot token.' : `Discord said no (${res.status}): ${detail}` }, { status: 502 });
    }
    return NextResponse.json({ success: true, registered: COMMAND.name });
  } catch {
    return NextResponse.json({ error: 'Could not reach Discord. Try again.' }, { status: 502 });
  }
}
