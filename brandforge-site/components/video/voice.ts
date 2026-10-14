'use client';

// Free voice-over: Kokoro, an open-source (Apache-2.0) speech model that runs in the person's own browser. It is loaded
// from a public CDN the first time someone asks for a voice, then the browser keeps it. Nothing is sent to a server, and
// there is no key and no bill. English voices.
export const VOICES = [
  { id: 'af_heart', label: 'Warm (female)' },
  { id: 'af_bella', label: 'Bright (female)' },
  { id: 'am_michael', label: 'Calm (male)' },
  { id: 'am_fenrir', label: 'Deep (male)' },
  { id: 'bf_emma', label: 'British (female)' },
  { id: 'bm_george', label: 'British (male)' },
] as const;
export type VoiceId = (typeof VOICES)[number]['id'];

type Tts = { generate: (text: string, options: { voice: string }) => Promise<{ audio: Float32Array; sampling_rate: number }> };
let ttsPromise: Promise<Tts> | null = null;

const KOKORO_URL = 'https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm';

/** Loads the voice model once per page. onStatus reports what is happening in plain words. */
export function loadVoice(onStatus?: (text: string) => void): Promise<Tts> {
  if (!ttsPromise) {
    ttsPromise = (async () => {
      onStatus?.('Downloading the voice (once, then it is kept)…');
      const mod = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ KOKORO_URL)) as { KokoroTTS: { from_pretrained: (id: string, options: Record<string, unknown>) => Promise<Tts> } };
      const tts = await mod.KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8', device: 'wasm' });
      onStatus?.('Voice ready.');
      return tts;
    })().catch((error) => {
      ttsPromise = null;
      throw error;
    });
  }
  return ttsPromise;
}

/** Speaks each scene's words. Returns one clip per scene (mono samples and their rate). */
export async function speakScenes(texts: string[], voice: VoiceId, onStatus?: (text: string) => void): Promise<{ samples: Float32Array; sampleRate: number }[]> {
  const tts = await loadVoice(onStatus);
  const clips: { samples: Float32Array; sampleRate: number }[] = [];
  for (let i = 0; i < texts.length; i++) {
    onStatus?.(`Recording the voice-over, ${i + 1} of ${texts.length}…`);
    const text = texts[i].trim();
    if (!text) {
      clips.push({ samples: new Float32Array(0), sampleRate: 24_000 });
      continue;
    }
    const out = await tts.generate(text, { voice });
    clips.push({ samples: out.audio, sampleRate: out.sampling_rate });
  }
  return clips;
}

/** Lays the clips on one track, each starting when its scene starts (plus a short lead-in). */
export function layTrack(clips: { samples: Float32Array; sampleRate: number }[], starts: number[], totalSeconds: number): { samples: Float32Array; sampleRate: number } | null {
  const rate = clips.find((clip) => clip.samples.length > 0)?.sampleRate;
  if (!rate) return null;
  const track = new Float32Array(Math.ceil(totalSeconds * rate));
  clips.forEach((clip, i) => {
    const offset = Math.round(((starts[i] ?? 0) + 0.25) * rate);
    track.set(clip.samples.subarray(0, Math.max(0, track.length - offset)), Math.min(offset, track.length));
  });
  return { samples: track, sampleRate: rate };
}
