import { createHash } from 'node:crypto';
import { after, NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { SERVER_VOICES, speak, type ServerVoice } from '@/lib/voice-server';
import { screenText } from '@/lib/content-policy.js';
import { checkRateLimit } from '@/lib/rate-limit';
import { storeVoice, voiceCacheUrl } from '@/lib/project-db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// POST { text, voice } -> audio/wav. One scene's voice-over at a time, so each answer is small and quick. Free to try, like
// the makers: a per-person limit per hour, and the words are checked against the content policy first. Making speech is
// heavy on the server, so every line is made once: the same voice and words again are sent straight from storage.
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { text?: unknown; voice?: unknown };
  const text = String(body.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 600);
  if (!text) return NextResponse.json({ error: 'Nothing to say.' }, { status: 400 });
  const voice = (SERVER_VOICES as readonly string[]).includes(String(body.voice)) ? (body.voice as ServerVoice) : 'af_heart';
  const screened = screenText(text);
  if (!screened.ok) return NextResponse.json({ error: screened.message }, { status: 422 });

  const key = createHash('sha256').update(`v1|${voice}|${text}`).digest('hex');
  const cached = voiceCacheUrl(key);
  if (cached) {
    const head = await fetch(cached, { method: 'HEAD', signal: AbortSignal.timeout(3000) }).catch(() => null);
    // 303, not 307: a 307 makes the browser repeat the POST at the storage address, which refuses it. 303 turns it into
    // a plain GET of the stored file.
    if (head && head.ok) return NextResponse.redirect(cached, 303);
  }

  const user = await getAuthenticatedUser(request).catch(() => null);
  const rateKey = user ? `voice:u:${user.id}` : `voice:ip:${(request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown'}`;
  if (!checkRateLimit(rateKey, { limit: 40, windowMs: 60 * 60 * 1000 }).allowed) return NextResponse.json({ error: 'That is a lot of voice-overs for one hour. Try again later.' }, { status: 429 });
  try {
    const wav = await speak(text, voice);
    after(() => storeVoice(key, new Uint8Array(wav)));
    return new NextResponse(wav, { headers: { 'Content-Type': 'audio/wav', 'Cache-Control': 'private, max-age=3600' } });
  } catch (error) {
    console.error('[voice] failed:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'The voice is not available right now. Try again in a moment, or make the video without it.' }, { status: 503 });
  }
}
