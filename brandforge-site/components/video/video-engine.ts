'use client';

import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { drawArt } from '@/lib/carousel-art.js';
import { THEMES } from '@/lib/carousel-render.js';
import { FPS, sceneAt, totalSeconds, type VideoScene } from '@/lib/video-scenes.js';

// The video engine. Everything happens in the person's own browser: each frame is drawn on a canvas (the same looks and
// art as carousels), encoded to H.264 with the browser's built-in encoder (WebCodecs), and packed into an MP4. A voice-over,
// when there is one, is mixed into one track and encoded alongside. No server, no upload, no cost.

export type Look = { bg: string; text: string; accent: string; muted: string; art: string; light: boolean };
export type VideoBrand = { name: string; handle: string };
export type VoiceTrack = { samples: Float32Array; sampleRate: number } | null;

const HEAD = 'BFAnton, Impact, sans-serif';
const BODY = 'BFInter, system-ui, sans-serif';

export function lookOf(theme: string): Look {
  return ((THEMES as Record<string, Look>)[theme] ?? (THEMES as Record<string, Look>).forge) as Look;
}

export function makeArt(w: number, h: number, look: Look, seed: string): HTMLCanvasElement {
  return drawArt(w, h, { art: look.art as 'burst' | 'shards' | 'rings' | 'soft', variant: 'cover', seed, accent: look.accent }) as HTMLCanvasElement;
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth || !line) line = next;
    else {
      out.push(line);
      line = word;
    }
  }
  if (line) out.push(line);
  return out;
}

const ease = (x: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);

/** A scene's picture (an AI painting when there is one, otherwise the look's drawn art). */
export type SceneArt = (index: number) => CanvasImageSource & { width: number; height: number };

const CROSSFADE = 0.5;

// Draws a picture to cover the frame (cropping, never stretching), with a slow push-in that drifts a different way each
// scene: the "Ken Burns" move that makes still pictures feel filmed.
function drawCover(ctx: CanvasRenderingContext2D, image: CanvasImageSource & { width: number; height: number }, w: number, h: number, progress: number, index: number, k: number): void {
  const scale = Math.max(w / image.width, h / image.height) * (1.06 + 0.1 * progress);
  const dw = image.width * scale;
  const dh = image.height * scale;
  const drift = (index % 2 === 0 ? -1 : 1) * 40 * k * progress;
  const lift = (index % 3 === 0 ? -1 : 1) * 20 * k * progress;
  ctx.drawImage(image, (w - dw) / 2 + drift, (h - dh) / 2 + lift, dw, dh);
}

/** Draws the frame at time t (seconds) onto a canvas sized w by h. */
export function drawFrame(ctx: CanvasRenderingContext2D, w: number, h: number, scenes: VideoScene[], t: number, look: Look, brand: VideoBrand, art: HTMLCanvasElement | SceneArt): void {
  if (scenes.length === 0) return;
  const { index, local } = sceneAt(scenes, t);
  const scene = scenes[index];
  const k = Math.min(w, h) / 1080;
  const m = 90 * k;
  const total = totalSeconds(scenes);
  const pictureOf: SceneArt = typeof art === 'function' ? art : () => art;

  // Background: this scene's picture moving slowly; in its last half second the next scene's picture fades in over it.
  ctx.fillStyle = look.bg;
  ctx.fillRect(0, 0, w, h);
  drawCover(ctx, pictureOf(index), w, h, local / Math.max(1, scene.seconds), index, k);
  const left = scene.seconds - local;
  if (left < CROSSFADE && index < scenes.length - 1) {
    ctx.globalAlpha = 1 - left / CROSSFADE;
    drawCover(ctx, pictureOf(index + 1), w, h, 0, index + 1, k);
    ctx.globalAlpha = 1;
  }
  // Shade for the words: a soft wash plus darker top and bottom, so text reads on any photo.
  const shade = look.light ? '246,241,233' : '0,0,0';
  ctx.fillStyle = `rgba(${shade},${scene.kind === 'point' ? 0.42 : 0.28})`;
  ctx.fillRect(0, 0, w, h);
  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  gradient.addColorStop(0, `rgba(${shade},0.55)`);
  gradient.addColorStop(0.3, `rgba(${shade},0)`);
  gradient.addColorStop(0.62, `rgba(${shade},0.15)`);
  gradient.addColorStop(1, `rgba(${shade},0.8)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, w, h);

  // Words: in over half a second, out over the last third of a second.
  const appear = ease(local / 0.5);
  const leave = scene.seconds - local < 0.35 ? ease((scene.seconds - local) / 0.35) : 1;
  const alpha = Math.min(appear, leave);
  const rise = (1 - appear) * 40 * k;
  const maxW = w - m * 2;
  const centred = scene.kind !== 'point';
  ctx.textAlign = centred ? 'center' : 'left';
  ctx.textBaseline = 'alphabetic';
  const x = centred ? w / 2 : m;

  let size = Math.round((scene.kind === 'point' ? 96 : 120) * k);
  ctx.font = `${size}px ${HEAD}`;
  let lines = wrap(ctx, scene.heading.toUpperCase(), maxW);
  while (lines.length > 4 && size > 48 * k) {
    size -= 8 * k;
    ctx.font = `${size}px ${HEAD}`;
    lines = wrap(ctx, scene.heading.toUpperCase(), maxW);
  }
  const lineH = size * 1.05;
  const bodySize = Math.round(46 * k);
  ctx.font = `600 ${bodySize}px ${BODY}`;
  const bodyLines = scene.lines.flatMap((line) => wrap(ctx, line, maxW - (scene.kind === 'point' ? 40 * k : 0)));
  const blockH = lines.length * lineH + (bodyLines.length ? 40 * k + bodyLines.length * bodySize * 1.35 : 0);
  let y = (h - blockH) / 2 + size * 0.85 + rise;

  ctx.globalAlpha = alpha;
  if (scene.kind === 'point') {
    ctx.fillStyle = look.accent;
    ctx.fillRect(m, y - size * 1.25, 120 * k, 10 * k);
  }
  ctx.fillStyle = look.text;
  ctx.font = `${size}px ${HEAD}`;
  for (const line of lines) {
    ctx.fillText(line, x, y);
    y += lineH;
  }
  if (bodyLines.length) {
    y += 40 * k - lineH + bodySize * 1.1;
    ctx.font = `600 ${bodySize}px ${BODY}`;
    bodyLines.forEach((line, i) => {
      // Each line arrives a beat after the one before it.
      ctx.globalAlpha = Math.min(alpha, ease((local - 0.25 - i * 0.18) / 0.4));
      ctx.fillStyle = scene.kind === 'end' && i === 0 ? look.accent : look.text;
      ctx.fillText(line, x, y);
      y += bodySize * 1.35;
    });
  }
  ctx.globalAlpha = 1;

  // Brand and progress: the name top-left, the handle bottom, a thin line that fills as the video plays.
  ctx.textAlign = 'left';
  if (brand.name) {
    ctx.fillStyle = look.text;
    ctx.font = `700 ${Math.round(34 * k)}px ${BODY}`;
    ctx.fillText(brand.name, m, m);
  }
  if (brand.handle) {
    ctx.fillStyle = look.muted;
    ctx.font = `600 ${Math.round(30 * k)}px ${BODY}`;
    ctx.textAlign = 'center';
    ctx.fillText(brand.handle, w / 2, h - m * 0.7);
    ctx.textAlign = 'left';
  }
  ctx.fillStyle = `rgba(${look.light ? '0,0,0' : '255,255,255'},0.15)`;
  ctx.fillRect(0, h - 8 * k, w, 8 * k);
  ctx.fillStyle = look.accent;
  ctx.fillRect(0, h - 8 * k, w * Math.min(1, t / Math.max(0.1, total)), 8 * k);
}

/** Can this browser make an MP4 here? */
export function canEncode(): boolean {
  return typeof window !== 'undefined' && typeof (window as unknown as { VideoEncoder?: unknown }).VideoEncoder === 'function';
}

async function pickVideoCodec(w: number, h: number): Promise<{ codec: string; muxer: 'avc' | 'vp9' } | null> {
  const tries: { codec: string; muxer: 'avc' | 'vp9' }[] = [
    { codec: 'avc1.640028', muxer: 'avc' },
    { codec: 'avc1.4d0028', muxer: 'avc' },
    { codec: 'avc1.42002a', muxer: 'avc' },
    { codec: 'vp09.00.40.08', muxer: 'vp9' },
  ];
  for (const option of tries) {
    const support = await VideoEncoder.isConfigSupported({ codec: option.codec, width: w, height: h, bitrate: 6_000_000, framerate: FPS }).catch(() => null);
    if (support?.supported) return option;
  }
  return null;
}

async function pickAudioCodec(sampleRate: number): Promise<{ codec: string; muxer: 'aac' | 'opus' } | null> {
  if (typeof (window as unknown as { AudioEncoder?: unknown }).AudioEncoder !== 'function') return null;
  for (const option of [{ codec: 'mp4a.40.2', muxer: 'aac' as const }, { codec: 'opus', muxer: 'opus' as const }]) {
    const support = await AudioEncoder.isConfigSupported({ codec: option.codec, sampleRate, numberOfChannels: 1, bitrate: 128_000 }).catch(() => null);
    if (support?.supported) return option;
  }
  return null;
}

/** Resamples mono audio by straight-line interpolation (good enough for speech). */
export function resample(samples: Float32Array, from: number, to: number): Float32Array {
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

/** Renders every frame and returns an MP4. onProgress gets 0..1. */
export async function encodeVideo(opts: { w: number; h: number; scenes: VideoScene[]; look: Look; brand: VideoBrand; art: HTMLCanvasElement | SceneArt; voice: VoiceTrack; onProgress?: (share: number) => void; signal?: AbortSignal }): Promise<Blob> {
  const { w, h, scenes, look, brand, art, voice } = opts;
  const video = await pickVideoCodec(w, h);
  if (!video) throw new Error('This browser cannot make MP4 video. Try a recent Chrome, Edge or Safari.');
  const AUDIO_RATE = 48_000;
  const audio = voice ? await pickAudioCodec(AUDIO_RATE) : null;

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: video.muxer, width: w, height: h, frameRate: FPS },
    ...(audio ? { audio: { codec: audio.muxer, numberOfChannels: 1, sampleRate: AUDIO_RATE } } : {}),
    fastStart: 'in-memory',
  });

  let failure: Error | null = null;
  const encoder = new VideoEncoder({ output: (chunk, meta) => muxer.addVideoChunk(chunk, meta), error: (error) => (failure = error as Error) });
  encoder.configure({ codec: video.codec, width: w, height: h, bitrate: 6_000_000, framerate: FPS });

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not draw the video.');
  const frames = Math.max(1, Math.round(totalSeconds(scenes) * FPS));
  for (let i = 0; i < frames; i++) {
    if (opts.signal?.aborted) throw new Error('Stopped.');
    if (failure) throw failure;
    drawFrame(ctx, w, h, scenes, i / FPS, look, brand, art);
    const frame = new VideoFrame(canvas, { timestamp: Math.round((i * 1_000_000) / FPS), duration: Math.round(1_000_000 / FPS) });
    encoder.encode(frame, { keyFrame: i % (FPS * 2) === 0 });
    frame.close();
    // Let the encoder drain so memory stays flat, and keep the page responsive.
    if (encoder.encodeQueueSize > 8) await new Promise((resolve) => setTimeout(resolve, 0));
    if (i % 15 === 0) {
      opts.onProgress?.(i / frames * (audio ? 0.9 : 1));
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
  await encoder.flush();
  encoder.close();

  if (audio && voice) {
    const samples = resample(voice.samples, voice.sampleRate, AUDIO_RATE);
    const audioEncoder = new AudioEncoder({ output: (chunk, meta) => muxer.addAudioChunk(chunk, meta), error: (error) => (failure = error as Error) });
    audioEncoder.configure({ codec: audio.codec, sampleRate: AUDIO_RATE, numberOfChannels: 1, bitrate: 128_000 });
    const block = 4800;
    for (let start = 0; start < samples.length; start += block) {
      const part = samples.subarray(start, Math.min(samples.length, start + block));
      const data = new AudioData({ format: 'f32', sampleRate: AUDIO_RATE, numberOfFrames: part.length, numberOfChannels: 1, timestamp: Math.round((start * 1_000_000) / AUDIO_RATE), data: part.slice() });
      audioEncoder.encode(data);
      data.close();
    }
    await audioEncoder.flush();
    audioEncoder.close();
  }
  if (failure) throw failure;
  muxer.finalize();
  opts.onProgress?.(1);
  return new Blob([target.buffer], { type: 'video/mp4' });
}
