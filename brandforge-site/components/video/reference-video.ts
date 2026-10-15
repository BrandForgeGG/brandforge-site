'use client';

import { findCuts } from '@/lib/reference-format.js';

// "Make one like this", the browser part: a video the member likes is measured right here. We sample it a few times a
// second to find its cuts, grab five frames (the opening, the close and three between), and keep a short mono sound track
// for the words. Only those leave the device; the video itself never does.

const MAX_SECONDS = 90;
const SPEECH_RATE = 16_000;

export type ReferenceSample = {
  measured: { duration: number; cuts: number[] };
  frames: Blob[];
  audio: Blob | null;
  tall: boolean;
};

function seek(video: HTMLVideoElement, t: number): Promise<void> {
  return new Promise((resolve) => {
    const done = () => {
      window.clearTimeout(timer);
      video.removeEventListener('seeked', done);
      resolve();
    };
    const timer = window.setTimeout(done, 2500);
    video.addEventListener('seeked', done);
    video.currentTime = t;
  });
}

function loaded(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve, reject) => {
    if (video.readyState >= 1) return resolve();
    video.addEventListener('loadedmetadata', () => resolve(), { once: true });
    video.addEventListener('error', () => reject(new Error('This video cannot be opened in your browser. Try an MP4 or a WebM file.')), { once: true });
  });
}

/** 16-bit mono WAV, what the transcriber takes. */
function wav(samples: Float32Array, rate: number): Blob {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const text = (at: number, s: string) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 0x7fff, true);
  return new Blob([buffer], { type: 'audio/wav' });
}

/** The first MAX_SECONDS of sound as 16 kHz mono, or null when the video is silent or its sound cannot be read. */
async function speechTrack(file: File, seconds: number): Promise<Blob | null> {
  try {
    const context = new AudioContext();
    const decoded = await context.decodeAudioData(await file.arrayBuffer()).finally(() => void context.close());
    const length = Math.ceil(Math.min(seconds, decoded.duration) * SPEECH_RATE);
    const offline = new OfflineAudioContext(1, length, SPEECH_RATE);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    const rendered = await offline.startRendering();
    const samples = rendered.getChannelData(0);
    let energy = 0;
    for (let i = 0; i < samples.length; i += 16) energy += samples[i] * samples[i];
    if (energy / (samples.length / 16) < 1e-6) return null;
    return wav(samples, SPEECH_RATE);
  } catch {
    return null;
  }
}

/** Measures a reference video. onStep reports what is happening, for the waiting line. */
export async function sampleReference(file: File, onStep: (step: string) => void): Promise<ReferenceSample> {
  if (!file.type.startsWith('video/')) throw new Error('Pick a video file (MP4, MOV or WebM).');
  if (file.size > 250_000_000) throw new Error('That file is over 250 MB. Pick a shorter or smaller video.');
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;
  try {
    await loaded(video);
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    if (duration < 4) throw new Error('That video is too short to learn from. Pick one of at least 4 seconds.');
    const span = Math.min(duration, MAX_SECONDS);
    const tall = video.videoHeight > video.videoWidth;

    // Cuts: a tiny grey copy of each sample, compared with the one before.
    onStep('Finding its cuts…');
    const fps = span <= 45 ? 4 : 2;
    const small = document.createElement('canvas');
    small.width = 48;
    small.height = 27;
    const sctx = small.getContext('2d', { willReadFrequently: true });
    if (!sctx) throw new Error('This browser cannot read video frames.');
    let previous: Float32Array | null = null;
    const diffs: number[] = [];
    for (let t = 0; t < span; t += 1 / fps) {
      await seek(video, t);
      sctx.drawImage(video, 0, 0, small.width, small.height);
      const data = sctx.getImageData(0, 0, small.width, small.height).data;
      const grey = new Float32Array(small.width * small.height);
      for (let i = 0; i < grey.length; i++) grey[i] = (data[i * 4] * 0.299 + data[i * 4 + 1] * 0.587 + data[i * 4 + 2] * 0.114) / 255;
      if (previous) {
        let sum = 0;
        for (let i = 0; i < grey.length; i++) sum += Math.abs(grey[i] - previous[i]);
        diffs.push(sum / grey.length);
      }
      previous = grey;
    }
    const cuts = findCuts(diffs, fps);

    // Five frames for the eyes: the opening, the close, and three between.
    onStep('Picking the frames that matter…');
    const big = document.createElement('canvas');
    big.width = 512;
    big.height = Math.round((512 * (video.videoHeight || 288)) / (video.videoWidth || 512));
    const bctx = big.getContext('2d');
    const frames: Blob[] = [];
    if (bctx) {
      const times = [0.4, span * 0.25, span * 0.5, span * 0.75, Math.max(0.5, span - 0.6)];
      for (const t of times) {
        await seek(video, t);
        bctx.drawImage(video, 0, 0, big.width, big.height);
        const blob = await new Promise<Blob | null>((resolve) => big.toBlob(resolve, 'image/jpeg', 0.72));
        if (blob) frames.push(blob);
      }
    }

    onStep('Listening to it…');
    const audio = await speechTrack(file, span);
    return { measured: { duration: Math.round(span * 10) / 10, cuts }, frames, audio, tall };
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}
