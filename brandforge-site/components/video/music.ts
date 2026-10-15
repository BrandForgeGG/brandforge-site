'use client';

// A music bed for videos, composed right here in code (nothing to license, nothing to download): a four-chord progression
// as a soft pad, a light arpeggio on top, and for the upbeat style a gentle kick. It fades in and out and ducks under the
// voice-over so the words always read clearly. Same length and tempo every time for the same video.

export type MusicStyle = 'none' | 'warm' | 'upbeat';
export const MUSIC_STYLES: { id: MusicStyle; label: string }[] = [
  { id: 'warm', label: 'Warm music' },
  { id: 'upbeat', label: 'Upbeat music' },
  { id: 'none', label: 'No music' },
];

// C major, I V vi IV, as semitones above the root.
const PROGRESSION = [
  [0, 4, 7],
  [7, 11, 14],
  [9, 12, 16],
  [5, 9, 12],
];

const TAU = Math.PI * 2;
const hz = (root: number, semitones: number) => root * Math.pow(2, semitones / 12);

/** The bed as mono samples at `rate`, `seconds` long. */
export function makeBed(seconds: number, rate: number, style: Exclude<MusicStyle, 'none'>): Float32Array {
  const n = Math.max(1, Math.ceil(seconds * rate));
  const out = new Float32Array(n);
  const bpm = style === 'upbeat' ? 112 : 80;
  const beat = 60 / bpm;
  const bar = beat * 4;
  const root = 130.81; // C3
  let low = 0;
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    const barIndex = Math.floor(t / bar);
    const chord = PROGRESSION[barIndex % PROGRESSION.length];
    const inBar = t - barIndex * bar;
    // Pad: each chord swells in and settles, so the changes feel soft.
    const swell = Math.min(1, inBar / 0.6) * (0.75 + 0.25 * Math.cos((inBar / bar) * Math.PI));
    let pad = 0;
    for (const note of chord) {
      const f = hz(root, note);
      pad += Math.sin(TAU * f * t) * 0.55 + Math.sin(TAU * f * 2 * t + 0.4) * 0.18 + Math.sin(TAU * f * 0.5 * t) * 0.22;
    }
    pad *= swell / chord.length;
    // A gentle low-pass keeps the pad warm instead of buzzy.
    low += (pad - low) * 0.08;
    // Arpeggio: one chord note per half beat, an octave up, each a short plucked note.
    const step = beat / 2;
    const stepIndex = Math.floor(t / step);
    const sinceStep = t - stepIndex * step;
    const arpNote = chord[stepIndex % chord.length] + 12;
    const pluck = Math.exp(-sinceStep * (style === 'upbeat' ? 9 : 6));
    const arp = (Math.sin(TAU * hz(root, arpNote) * t) + 0.3 * Math.sin(TAU * hz(root, arpNote) * 3 * t)) * pluck * (style === 'upbeat' ? 0.32 : 0.22);
    // Upbeat: a soft kick on every beat (a falling sine).
    let kick = 0;
    if (style === 'upbeat') {
      const sinceBeat = t - Math.floor(t / beat) * beat;
      const sweep = 50 + 90 * Math.exp(-sinceBeat * 30);
      kick = Math.sin(TAU * sweep * sinceBeat) * Math.exp(-sinceBeat * 14) * 0.55;
    }
    out[i] = low * 0.9 + arp + kick;
  }
  // Fade in over a second and out over two, then set a quiet bed level.
  const fadeIn = Math.min(n, Math.round(rate));
  const fadeOut = Math.min(n, Math.round(rate * 2));
  for (let i = 0; i < fadeIn; i++) out[i] *= i / fadeIn;
  for (let i = 0; i < fadeOut; i++) out[n - 1 - i] *= i / fadeOut;
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]));
  const gain = peak > 0 ? 0.22 / peak : 0;
  for (let i = 0; i < n; i++) out[i] *= gain;
  return out;
}

/** Resamples by straight-line interpolation (enough for a voice track joining the bed). */
function resampleTo(samples: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return samples;
  const out = new Float32Array(Math.round((samples.length * to) / from));
  const ratio = from / to;
  for (let i = 0; i < out.length; i++) {
    const pos = i * ratio;
    const a = Math.floor(pos);
    const b = Math.min(samples.length - 1, a + 1);
    out[i] = samples[a] + (samples[b] - samples[a]) * (pos - a);
  }
  return out;
}

/** The voice track (if any) over the music bed, the bed ducked wherever someone is speaking. */
export function mixWithMusic(voice: { samples: Float32Array; sampleRate: number } | null, seconds: number, style: MusicStyle): { samples: Float32Array; sampleRate: number } | null {
  if (style === 'none') return voice;
  const rate = 48_000;
  const bed = makeBed(seconds, rate, style);
  if (!voice) return { samples: bed, sampleRate: rate };
  const words = resampleTo(voice.samples, voice.sampleRate, rate);
  const out = new Float32Array(Math.max(bed.length, words.length));
  let envelope = 0;
  for (let i = 0; i < out.length; i++) {
    const w = i < words.length ? words[i] : 0;
    // Follow the voice loudness (fast up, slow down) and lower the bed under it.
    const level = Math.abs(w);
    envelope = level > envelope ? envelope + (level - envelope) * 0.02 : envelope * 0.9997;
    const duck = 1 - Math.min(0.6, envelope * 6);
    const b = i < bed.length ? bed[i] * duck : 0;
    out[i] = Math.max(-1, Math.min(1, w + b));
  }
  return { samples: out, sampleRate: rate };
}

/** Plays the bed in time with a preview that starts now. Returns a stop function. */
export function playBed(context: AudioContext, seconds: number, style: MusicStyle, lead = 0.05): () => void {
  if (style === 'none') return () => undefined;
  const rate = context.sampleRate;
  const samples = makeBed(seconds, rate, style);
  const buffer = context.createBuffer(1, samples.length, rate);
  buffer.copyToChannel(new Float32Array(samples), 0);
  const source = context.createBufferSource();
  const gain = context.createGain();
  gain.gain.value = 0.55;
  source.buffer = buffer;
  source.connect(gain).connect(context.destination);
  source.start(context.currentTime + lead);
  return () => {
    try {
      source.stop();
    } catch {
      /* already finished */
    }
  };
}
