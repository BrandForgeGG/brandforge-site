'use client';

// Voice-over for videos. The speech is made in the visitor's own browser (Kokoro, an open-source model, in a worker:
// voice-worker.ts): free for us, private for them, and only the first video waits for the model to download. Browsers that
// cannot run it fall back to our server (lib/voice-server.ts). Clips are kept for the page's life, keyed by voice and words,
// so playing the preview and then making the MP4 makes each line only once.
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

type Pending = { resolve: (clip: Clip) => void; reject: (error: Error) => void };
let worker: Worker | null = null;
let workerBroken = false;
let nextId = 1;
const pending = new Map<number, Pending>();
// How far the first-time model download has got (0 to 100), for the waiting line; null once it is ready or not needed.
let loading: number | null = null;
let ready = false;
const loadingListeners = new Set<(progress: number | null) => void>();

function setLoading(progress: number | null) {
  loading = progress;
  loadingListeners.forEach((listener) => listener(progress));
}

function voiceWorker(): Worker | null {
  if (workerBroken || typeof Worker === 'undefined' || typeof WebAssembly === 'undefined') return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./voice-worker.ts', import.meta.url), { type: 'module' });
  } catch {
    workerBroken = true;
    return null;
  }
  worker.onmessage = (event: MessageEvent<{ type: string; id?: number; samples?: Float32Array; rate?: number; error?: string; progress?: number }>) => {
    const data = event.data;
    if (data.type === 'loading') return setLoading(data.progress ?? 0);
    if (data.type === 'ready') {
      ready = true;
      return setLoading(null);
    }
    const job = data.id !== undefined ? pending.get(data.id) : undefined;
    if (!job || data.id === undefined) return;
    pending.delete(data.id);
    ready = true;
    if (loading !== null) setLoading(null);
    if (data.type === 'done' && data.samples && data.rate) {
      const buffer = audioContext().createBuffer(1, data.samples.length, data.rate);
      buffer.copyToChannel(new Float32Array(data.samples), 0);
      job.resolve({ samples: data.samples, sampleRate: data.rate, seconds: data.samples.length / data.rate, buffer });
    } else job.reject(new Error(data.error || 'The voice could not be made in this browser.'));
  };
  worker.onerror = () => {
    // The worker itself failed to start (an old browser, a blocked download): everything waiting goes to the server.
    workerBroken = true;
    worker = null;
    setLoading(null);
    pending.forEach((job) => job.reject(new Error('browser voice unavailable')));
    pending.clear();
  };
  return worker;
}

function speakHere(text: string, voice: VoiceId): Promise<Clip> | null {
  const w = voiceWorker();
  if (!w) return null;
  const id = nextId++;
  return new Promise<Clip>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    w.postMessage({ id, text, voice });
  });
}

/** Starts loading the voice model in the background (call when a video maker opens with the voice on). */
export function warmVoice(): void {
  voiceWorker()?.postMessage({ warm: true });
}

/** Follows the first-time voice model download (0 to 100, then null). Returns a stop function. */
export function onVoiceLoading(listener: (progress: number | null) => void): () => void {
  loadingListeners.add(listener);
  listener(loading);
  return () => loadingListeners.delete(listener);
}

async function fetchClip(text: string, voice: VoiceId): Promise<Clip> {
  const here = speakHere(text, voice);
  if (here) {
    try {
      // While the model is still downloading for the first time on a slow connection, a line waits at most 25 seconds and
      // then comes from the server instead; the download carries on, so the next video is made here.
      if (ready) return await here;
      const late = new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 25_000));
      const clip = await Promise.race([here, late]);
      if (clip) return clip;
    } catch {
      // Falls through to the server below.
    }
  }
  return fetchFromServer(text, voice);
}

async function fetchFromServer(text: string, voice: VoiceId): Promise<Clip> {
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

/** Clips for every scene. In the browser they are made one after another by the same model; the server fallback takes four at a time. */
export async function clipsFor(texts: string[], voice: VoiceId, onProgress?: (done: number, total: number, note?: string) => void): Promise<Clip[]> {
  const out: Clip[] = new Array(texts.length);
  let next = 0;
  let done = 0;
  // The first video on a device waits for the voice model: say so, with how far it has got.
  const stop = onVoiceLoading((progress) => {
    if (progress !== null) onProgress?.(done, texts.length, `Getting the voice ready, first time only (${progress}%)…`);
  });
  const worker = async () => {
    for (let i = next++; i < texts.length; i = next++) {
      out[i] = await clipFor(texts[i], voice);
      done += 1;
      onProgress?.(done, texts.length);
    }
  };
  try {
    await Promise.all([worker(), worker(), worker(), worker()]);
  } finally {
    stop();
  }
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
