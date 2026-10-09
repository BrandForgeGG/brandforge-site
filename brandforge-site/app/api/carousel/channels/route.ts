import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { addCarouselChannel, getUserNotifyTargets, listCarouselChannels, removeCarouselChannel } from '@/lib/project-db';
import { linkBluesky, linkDiscordWebhook, linkTelegramChannel, type LinkResult } from '@/lib/carousel-channels';
import { checkRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function requireUser(request: NextRequest) {
  const user = await getAuthenticatedUser(request).catch(() => null);
  if (!user) return { error: NextResponse.json({ error: 'Sign in to link a channel.' }, { status: 401 }) } as const;
  return { user } as const;
}

// GET: your linked channels (names only, never a secret) and whether your Telegram is linked.
export async function GET(request: NextRequest) {
  const auth = await requireUser(request);
  if ('error' in auth) return auth.error;
  const [channels, targets] = await Promise.all([listCarouselChannels(auth.user.id), getUserNotifyTargets(auth.user.id).catch(() => ({ telegramChatId: null }))]);
  return NextResponse.json({
    channels: channels.map((c) => ({ id: c.id, kind: c.kind, label: c.label })),
    telegramLinked: Boolean(targets.telegramChatId),
  });
}

// POST { kind: 'telegram' | 'discord' | 'bluesky', ... }: verify and link a channel.
export async function POST(request: NextRequest) {
  const auth = await requireUser(request);
  if ('error' in auth) return auth.error;
  const rate = checkRateLimit(`carousel-link:${auth.user.id}`, { limit: 20, windowMs: 60 * 60 * 1000 });
  if (!rate.allowed) return NextResponse.json({ error: 'Too many tries. Wait a little and try again.' }, { status: 429 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  let linked: LinkResult;
  if (body.kind === 'telegram') linked = await linkTelegramChannel(auth.user.id, String(body.channel ?? ''));
  else if (body.kind === 'discord') linked = await linkDiscordWebhook(String(body.webhook ?? ''));
  else if (body.kind === 'bluesky') linked = await linkBluesky(String(body.handle ?? ''), String(body.password ?? ''));
  else return NextResponse.json({ error: 'Pick Telegram, Discord or Bluesky.' }, { status: 400 });
  if (!linked.ok) return NextResponse.json({ error: linked.error }, { status: 422 });

  const saved = await addCarouselChannel(auth.user.id, { kind: linked.kind, label: linked.label, secret: linked.secret, meta: linked.meta });
  if (!saved.ok) {
    const message = saved.error === 'limit' ? 'You can link up to 10 channels.' : saved.error === 'duplicate' ? 'That channel is already linked.' : 'Could not save that channel. Try again.';
    return NextResponse.json({ error: message }, { status: saved.error === 'failed' ? 500 : 409 });
  }
  return NextResponse.json({ channel: { id: saved.id, kind: linked.kind, label: linked.label } });
}

// DELETE ?id=: unlink one of your channels (its saved login is deleted with it).
export async function DELETE(request: NextRequest) {
  const auth = await requireUser(request);
  if ('error' in auth) return auth.error;
  const id = request.nextUrl.searchParams.get('id') ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Unknown channel.' }, { status: 400 });
  return NextResponse.json({ success: await removeCarouselChannel(auth.user.id, id) });
}
