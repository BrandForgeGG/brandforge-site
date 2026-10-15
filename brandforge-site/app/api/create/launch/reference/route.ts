import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { checkRateLimit } from '@/lib/rate-limit';
import { screenText } from '@/lib/content-policy.js';
import { buildReferencePrompt, normalizeFormat, pacingOf } from '@/lib/reference-format.js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const LIMIT = { limit: 6, windowMs: 60 * 60 * 1000 };
const GROQ = 'https://api.groq.com/openai/v1';
const MAX_AUDIO = 3_300_000;
const MAX_FRAME = 400_000;
const MAX_FRAMES = 5;

type Transcript = { text: string; words: number; timed: string };

/** What was said, with rough times, from Groq's hosted Whisper. Null when there is nothing to hear or it fails. */
async function transcribe(key: string, audio: File): Promise<Transcript | null> {
  const form = new FormData();
  form.append('file', audio, 'reference.wav');
  form.append('model', process.env.GROQ_WHISPER_MODEL || 'whisper-large-v3-turbo');
  form.append('response_format', 'verbose_json');
  const res = await fetch(`${GROQ}/audio/transcriptions`, { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(25_000) });
  if (!res.ok) {
    console.warn('[reference] transcription failed:', res.status, (await res.text().catch(() => '')).slice(0, 160));
    return null;
  }
  const data = (await res.json().catch(() => null)) as { text?: string; segments?: { start: number; text: string }[] } | null;
  const text = String(data?.text ?? '').trim();
  if (!text) return null;
  const timed = (data?.segments ?? []).map((s) => `[${Math.round(s.start)}s] ${String(s.text).trim()}`).join('\n');
  return { text, words: text.split(/\s+/).filter(Boolean).length, timed: timed || text };
}

/** One chat call to Groq; images (data URLs) make it a vision call. */
async function ask(key: string, model: string, system: string, user: string, images: string[]): Promise<string> {
  const content = images.length ? [{ type: 'text', text: user }, ...images.map((url) => ({ type: 'image_url', image_url: { url } }))] : user;
  const res = await fetch(`${GROQ}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, temperature: 0.3, max_tokens: 1500, messages: [{ role: 'system', content: system }, { role: 'user', content }] }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error(`${res.status} ${(await res.text().catch(() => '')).slice(0, 160)}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return String(data.choices?.[0]?.message?.content ?? '');
}

// POST multipart { measured: {duration, cuts}, audio?: wav, frames?: jpeg[] } -> { format }. The browser has already cut
// the member's reference video down to its measurements, a short mono sound track and a few frames; the video itself never
// leaves their device. We listen, look, and answer with the format to follow. Nothing is stored.
export async function POST(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request).catch(() => null);
    const rateKey = user ? `reference:u:${user.id}` : `reference:ip:${(request.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown'}`;
    if (!checkRateLimit(rateKey, LIMIT).allowed) return NextResponse.json({ error: 'That is a lot of reference videos for one hour. Try again in a little while.' }, { status: 429 });
    const key = String(process.env.GROQ_API_KEY ?? '').trim();

    const form = await request.formData().catch(() => null);
    if (!form) return NextResponse.json({ error: 'The video measurements did not arrive. Try again.' }, { status: 400 });
    let measured: { duration?: unknown; cuts?: unknown } = {};
    try {
      measured = JSON.parse(String(form.get('measured') ?? '{}'));
    } catch {
      return NextResponse.json({ error: 'The video measurements did not arrive. Try again.' }, { status: 400 });
    }
    const duration = Number(measured.duration);
    if (!Number.isFinite(duration) || duration < 4) return NextResponse.json({ error: 'That video is too short to learn from. Pick one of at least 4 seconds.' }, { status: 400 });

    const audio = form.get('audio');
    const frames: string[] = [];
    for (const entry of form.getAll('frames').slice(0, MAX_FRAMES)) {
      if (!(entry instanceof File) || entry.size > MAX_FRAME || !/^image\/(jpeg|png|webp)$/.test(entry.type)) continue;
      frames.push(`data:${entry.type};base64,${Buffer.from(await entry.arrayBuffer()).toString('base64')}`);
    }

    const heard = key && audio instanceof File && audio.size > 1000 && audio.size <= MAX_AUDIO ? await transcribe(key, audio).catch(() => null) : null;
    const pacing = pacingOf({ duration, cuts: Array.isArray(measured.cuts) ? (measured.cuts as number[]) : [], words: heard?.words ?? 0 });
    const measuredOnly = () => NextResponse.json({ format: normalizeFormat(null, pacing), partial: true });
    if (!key) return measuredOnly();

    // Sound that was there but could not be transcribed is said as such, so the model does not call the video silent.
    const spoken = heard?.timed ?? (audio instanceof File && audio.size > 1000 ? '(the sound could not be transcribed)' : '');
    const prompt = buildReferencePrompt({ pacing, transcript: spoken });
    // Look at the frames when the vision model answers; otherwise judge from the pace and the words alone.
    const attempts: [string, string[]][] = [
      [process.env.GROQ_VISION_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct', frames],
      [process.env.GROQ_MODEL || 'openai/gpt-oss-120b', []],
    ];
    for (const [model, images] of attempts) {
      if (images === frames && frames.length === 0) continue;
      try {
        const answer = await ask(key, model, prompt.system, images.length ? prompt.user : `${prompt.user}\n(No frames available: judge from the pace and the words.)`, images);
        const format = normalizeFormat(answer, pacing);
        if (!format) continue;
        const words = screenText(`${format.summary} ${format.hook} ${format.cta}`);
        if (!words.ok) return measuredOnly();
        return NextResponse.json({ format, partial: false });
      } catch (cause) {
        console.warn('[reference] model failed:', model, cause instanceof Error ? cause.message : cause);
      }
    }
    return measuredOnly();
  } catch (error) {
    console.error('Reference video error:', error);
    return NextResponse.json({ error: 'Something went wrong. Try again.' }, { status: 500 });
  }
}
