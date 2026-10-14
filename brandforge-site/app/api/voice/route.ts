import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { SERVER_VOICES, speak, type ServerVoice } from '@/lib/voice-server';
import { screenText } from '@/lib/content-policy.js';
import { checkRateLimit } from '@/lib/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// POST { text, voice } -> audio/wav. One scene's voice-over at a time, so each answer is small and quick. Free to try, like
// the makers: a per-person limit per hour, and the words are checked against the content policy first.
export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request).catch(() => null);
  const key = user ? `voice:u:${user.id}` : `voice:ip:${(request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown'}`;
  if (!checkRateLimit(key, { limit: 120, windowMs: 60 * 60 * 1000 }).allowed) return NextResponse.json({ error: 'That is a lot of voice-overs for one hour. Try again later.' }, { status: 429 });
  const body = (await request.json().catch(() => ({}))) as { text?: unknown; voice?: unknown };
  const text = String(body.text ?? '').replace(/\s+/g, ' ').trim().slice(0, 600);
  if (!text) return NextResponse.json({ error: 'Nothing to say.' }, { status: 400 });
  const voice = (SERVER_VOICES as readonly string[]).includes(String(body.voice)) ? (body.voice as ServerVoice) : 'af_heart';
  const screened = screenText(text);
  if (!screened.ok) return NextResponse.json({ error: screened.message }, { status: 422 });
  try {
    const wav = await speak(text, voice);
    return new NextResponse(wav, { headers: { 'Content-Type': 'audio/wav', 'Cache-Control': 'private, max-age=3600' } });
  } catch (error) {
    console.error('[voice] failed:', error instanceof Error ? error.message : error);
    return NextResponse.json({ error: 'The voice is not available right now. Try again in a moment, or make the video without it.' }, { status: 503 });
  }
}
