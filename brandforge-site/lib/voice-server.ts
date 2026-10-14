import { KokoroTTS } from 'kokoro-js';

// Free voice-over, made on our own server: Kokoro, an open-source (Apache-2.0) speech model, run on the server's CPU. The
// model is fetched once per server instance into its temporary disk and kept in memory, so visitors never download it; the
// browser only receives the finished audio for each scene. English voices.
export const SERVER_VOICES = ['af_heart', 'af_bella', 'am_michael', 'am_fenrir', 'bf_emma', 'bm_george'] as const;
export type ServerVoice = (typeof SERVER_VOICES)[number];

let ttsPromise: Promise<KokoroTTS> | null = null;

async function load(): Promise<KokoroTTS> {
  // The model files go to the one writable folder a serverless function has.
  const transformers = await import('@huggingface/transformers');
  transformers.env.cacheDir = '/tmp/hf-cache';
  transformers.env.allowLocalModels = false;
  return KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', { dtype: 'q8', device: 'cpu' });
}

function model(): Promise<KokoroTTS> {
  if (!ttsPromise) {
    ttsPromise = load().catch((error) => {
      ttsPromise = null;
      throw error;
    });
  }
  return ttsPromise;
}

/** Speaks one piece of text. Returns a WAV file (mono, the model's own sample rate). */
export async function speak(text: string, voice: ServerVoice): Promise<ArrayBuffer> {
  const tts = await model();
  const audio = await tts.generate(text, { voice });
  return audio.toWav();
}
