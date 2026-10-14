'use client';

// Voice-over for videos. The speech is made on our own server (Kokoro, an open-source model: lib/voice-server.ts) and comes
// back as a small audio file per scene, so nothing heavy is downloaded here. Clips are kept for the page's life, keyed by
// voice and words, so playing the preview and then making the MP4 asks the server only once.
export const VOICES = [
  { id: 'af_heart', label: 'Warm (female)' },
  { id: 'af_bella', label: 'Bright (female)' },
  { id: 'am_michael', label: 'Calm (male)' },
  { id: 'am_fenrir', label: 'Deep (male)' },
  { id: 'bf_emma', label: 'British (female)' },
  { id: 'bm_george', label: 'British (male)' },
] as const;
export type VoiceId = (typeof VOICES)[number]['id'];

export type Clip = { samples: Float32Array; sampleRate: number; seconds: number; buffer: AudioBuffer };

const cache = new Map<string, Promise<Clip>>();
let context: AudioContext | null = null;

export function audioContext(): AudioContext {
  if (!context) context = new AudioContext();
  return context;
}

async function fetchClip(text: string, voice: VoiceId): Promise<Clip> {
  const res = await fetch('/api/voice', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, voice }) });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || 'The voice is not available right now.');
  }
  const buffer = await audioContext().decodeAudioData(await res.arrayBuffer());
  const samples = buffer.getChannelData(0).slice();
  return { samples, sampleRate: buffer.sampleRate, seconds: buffer.duration, buffer };
}

/** One clip for one scene's words (from the page's memory when it was made before). */
export function clipFor(text: string, voice: VoiceId): Promise<Clip> {
  const key = `${voice}|${text.trim()}`;
  let clip = cache.get(key);
  if (!clip) {
    clip = fetchClip(text.trim(), voice).catch((error) => {
      cache.delete(key);
      throw error;
    });
    cache.set(key, clip);
  }
  return clip;
}

/** Clips for every scene, four at a time (each on its own server, so a video takes about as long as its longest scene). */
export async function clipsFor(texts: string[], voice: VoiceId, onProgress?: (done: number, total: number) => void): Promise<Clip[]> {
  const out: Clip[] = new Array(texts.length);
  let next = 0;
  let done = 0;
  const worker = async () => {
    for (let i = next++; i < texts.length; i = next++) {
      out[i] = await clipFor(texts[i], voice);
      done += 1;
      onProgress?.(done, texts.length);
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  return out;
}

/** Lays the clips on one track, each starting when its scene starts (plus a short lead-in). */
export function layTrack(clips: Clip[], starts: number[], totalSeconds: number): { samples: Float32Array; sampleRate: number } | null {
  const rate = clips.find((clip) => clip && clip.samples.length > 0)?.sampleRate;
  if (!rate) return null;
  const track = new Float32Array(Math.ceil(totalSeconds * rate));
  clips.forEach((clip, i) => {
    if (!clip) return;
    const offset = Math.min(track.length, Math.round(((starts[i] ?? 0) + VOICE_LEAD) * rate));
    track.set(clip.samples.subarray(0, Math.max(0, track.length - offset)), offset);
  });
  return { samples: track, sampleRate: rate };
}

/** The voice starts this long after its scene, so the words appear first. */
export const VOICE_LEAD = 0.25;

/** Plays the clips in time with a preview that starts now. Returns a stop function. */
export function playClips(clips: Clip[], starts: number[]): () => void {
  const ctx = audioContext();
  void ctx.resume();
  const at = ctx.currentTime + 0.05;
  const sources = clips.map((clip, i) => {
    const source = ctx.createBufferSource();
    source.buffer = clip.buffer;
    source.connect(ctx.destination);
    source.start(at + (starts[i] ?? 0) + VOICE_LEAD);
    return source;
  });
  return () => {
    for (const source of sources) {
      try {
        source.stop();
      } catch {
        /* already finished */
      }
    }
  };
}
