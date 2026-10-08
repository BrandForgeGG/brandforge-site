import { after, NextRequest, NextResponse } from 'next/server';
import { verifyDiscordSignature } from '@/lib/discord-verify.js';
import { handleDiscordCommand, type DiscordInteraction } from '@/lib/discord-bot';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Discord slash commands: /brandforge. Discord signs every request; anything unsigned or signed
// with the wrong key is rejected. Dormant until DISCORD_PUBLIC_KEY is set and the application's
// Interactions Endpoint URL points here.
export async function POST(request: NextRequest) {
  const publicKey = String(process.env.DISCORD_PUBLIC_KEY ?? '').trim();
  if (!publicKey) return NextResponse.json({ error: 'Not configured' }, { status: 503 });

  const rawBody = await request.text();
  const valid = verifyDiscordSignature({
    publicKeyHex: publicKey,
    signatureHex: request.headers.get('x-signature-ed25519') ?? '',
    timestamp: request.headers.get('x-signature-timestamp') ?? '',
    rawBody,
  });
  if (!valid) return new NextResponse('invalid request signature', { status: 401 });

  const interaction = JSON.parse(rawBody) as DiscordInteraction;

  // Type 1: Discord's liveness check.
  if (interaction.type === 1) return NextResponse.json({ type: 1 });

  // Type 2: a slash command. Acknowledge now (type 5 = "thinking"), answer when the turn finishes.
  if (interaction.type === 2) {
    after(async () => {
      await handleDiscordCommand(interaction);
    });
    return NextResponse.json({ type: 5 });
  }

  return NextResponse.json({ type: 1 });
}
