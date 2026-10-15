/// <reference lib="webworker" />
import { KokoroTTS } from 'kokoro-js';

// The voice-over model, running in the visitor's own browser (a worker, so the page stays smooth). The same open-source
// Kokoro voices the server used; the model (about 90 MB) downloads once and the browser keeps it, so later videos start fast.
// Making voice here costs the visitor's device a few seconds and costs our servers nothing.

type Request = { id: number; text: string; voice: string; warm?: boolean };

let model: Promise<KokoroTTS> | null = null;

function load(): Promise<KokoroTTS> {
  model ??= KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-v1.0-ONNX', {
    dtype: 'q8',
    device: 'wasm',
    progress_callback: (info: { status?: string; progress?: number; file?: string }) => {
      if (info.status === 'progress' && typeof info.progress === 'number' && String(info.file ?? '').endsWith('.onnx')) {
        self.postMessage({ type: 'loading', progress: Math.round(info.progress) });
      }
    },
  }).catch((error) => {
    model = null;
    throw error;
  });
  return model;
}

self.onmessage = async (event: MessageEvent<Request>) => {
  const { id, text, voice } = event.data;
  if (event.data.warm) {
    // Opened a video maker: start the download now, so the voice is ready by the time the scenes are written.
    void load().then(() => self.postMessage({ type: 'ready' }), () => undefined);
    return;
  }
  try {
    const tts = await load();
    const audio = await tts.generate(text, { voice: voice as Parameters<KokoroTTS['generate']>[1] extends { voice?: infer V } ? V : never });
    const samples = audio.audio as Float32Array;
    self.postMessage({ type: 'done', id, samples, rate: audio.sampling_rate }, [samples.buffer]);
  } catch (error) {
    self.postMessage({ type: 'failed', id, error: error instanceof Error ? error.message : String(error) });
  }
};
