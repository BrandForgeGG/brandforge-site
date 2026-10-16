'use client';

import { sceneAt, totalSeconds } from '@/lib/video-scenes.js';
import {
  cardStarts,
  coverImage,
  fitBig,
  formatNumber,
  rgba,
  roundRect,
  setSpacing,
  wrap,
  type Img,
  type KineticBrand,
  type KineticCard,
  type KineticLook,
  type KineticScene,
} from '@/components/video/kinetic-engine';

// Two more ways the same story can move, beside Kinetic. Both read the same cards (one idea each, cut on the music's
// beat) and the same real words, pictures and site screenshot; only the treatment changes.
//  - Cinematic: the brand's own pictures fill the frame, blurred and slowly pushing in, with film bars and a vignette;
//    a serif headline and the real site float over them in a soft-shadowed window. Calm, premium, filmed.
//  - Glow: near-black with slow glowing colour fields; words sit in glowing pills joined by a thin line with a travelling
//    dot; numbers and pictures get a soft light edge. Minimal and techy.
// Drawn on a 2D canvas in the browser, deterministic in time (no random, no clock).

const SERIF = 'BFFraunces, Georgia, serif';
const SANS = 'BFInter, system-ui, sans-serif';

/** Loads the faces these looks draw with (once per page). */
let fontsLoading: Promise<void> | null = null;
export function loadLookFonts(): Promise<void> {
  fontsLoading ??= Promise.all(
    ([['BFFraunces', '/fonts/fraunces-latin-variable.woff2', '100 900'], ['BFInter', '/fonts/inter-latin-variable.woff2', '100 900']] as const).map(async ([family, url, weight]) => {
      try {
        if ([...document.fonts].some((face) => face.family === family && face.status === 'loaded')) return;
        const face = new FontFace(family, `url(${url})`, { weight });
        await face.load();
        document.fonts.add(face);
      } catch {
        /* the drawing falls back to a system face */
      }
    })
  ).then(() => undefined);
  return fontsLoading;
}

const clamp = (x: number) => Math.min(1, Math.max(0, x));
const easeOut = (x: number) => 1 - Math.pow(1 - clamp(x), 3);
const easeInOut = (x: number) => {
  const v = clamp(x);
  return v < 0.5 ? 4 * v * v * v : 1 - Math.pow(-2 * v + 2, 3) / 2;
};

type Picked = { index: number; local: number; start: number; card: KineticCard | undefined; cardLocal: number; span: number; n: number; first: boolean };

/** The scene and card on screen at time t, on the beat grid shared with Kinetic. */
function pick(scenes: KineticScene[], t: number, beat: number): Picked {
  const { index, local, start } = sceneAt(scenes, t);
  const scene = scenes[index];
  const starts = cardStarts(start, scene.seconds, scene.cards.length, beat);
  let ci = 0;
  while (ci + 1 < starts.length && local >= starts[ci + 1]) ci += 1;
  let n = 0;
  for (let i = 0; i < index; i++) n += Math.max(1, scenes[i].cards.length);
  return {
    index,
    local,
    start,
    card: scene.cards[ci],
    cardLocal: local - starts[ci],
    span: (ci + 1 < starts.length ? starts[ci + 1] : scene.seconds) - starts[ci],
    n: n + ci,
    first: index === 0 && ci === 0,
  };
}

function rail(ctx: CanvasRenderingContext2D, w: number, h: number, k: number, t: number, total: number, color: string, track: string): void {
  ctx.fillStyle = track;
  ctx.fillRect(0, h - 6 * k, w, 6 * k);
  ctx.fillStyle = color;
  ctx.fillRect(0, h - 6 * k, w * clamp(t / Math.max(0.1, total)), 6 * k);
}

// ============================================================================================ Cinematic

function cinematicBackdrop(ctx: CanvasRenderingContext2D, w: number, h: number, image: Img | null, progress: number, look: KineticLook, alpha: number): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  if (image) {
    ctx.filter = 'blur(14px) saturate(1.15)';
    const zoom = 1.12 + 0.1 * progress;
    coverImage(ctx, image, -20, -20, w + 40, h + 40, zoom, false);
    ctx.filter = 'none';
  } else {
    const g = ctx.createRadialGradient(w * (0.3 + 0.2 * progress), h * 0.35, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.8);
    g.addColorStop(0, rgba(look.accent, 0.55));
    g.addColorStop(0.5, '#1a1310');
    g.addColorStop(1, '#0b0908');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }
  ctx.restore();
}

function cinematicCard(ctx: CanvasRenderingContext2D, w: number, h: number, k: number, tall: boolean, card: KineticCard, local: number, span: number, instant: boolean, look: KineticLook, seed: number): void {
  const a = instant ? 1 : easeOut(local / 0.5);
  const rise = (1 - a) * 40 * k;
  const margin = (tall ? 80 : 160) * k;
  const maxW = w - margin * 2;
  const text = '#fbf6f0';
  const soft = 'rgba(251,246,240,0.78)';
  ctx.save();
  ctx.globalAlpha *= a;
  ctx.textAlign = 'center';
  if (card.kind === 'words') {
    const { lines, size } = fitBig(ctx, card.text, (s) => `600 ${s}px ${SERIF}`, maxW, h * 0.42, tall ? 5 : 3, (tall ? 112 : 120) * k, 54 * k);
    ctx.font = `600 ${size}px ${SERIF}`;
    setSpacing(ctx, -size * 0.02);
    ctx.fillStyle = card.accent ? look.accent : text;
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 30 * k;
    const lineH = size * 1.06;
    const top = h / 2 - (lines.length * lineH) / 2 + size * 0.8 - (card.sub ? 40 * k : 0) + rise;
    lines.forEach((line, i) => ctx.fillText(line, w / 2, top + i * lineH));
    setSpacing(ctx, 0);
    if (card.strike) {
      const s = easeOut((local - span * 0.45) / 0.4);
      ctx.fillStyle = look.accent;
      ctx.fillRect(w / 2 - (maxW / 2) * s, top + (lines.length - 1) * lineH / 2 - size * 0.3, maxW * s, 6 * k);
    }
    if (card.sub) {
      ctx.shadowBlur = 0;
      ctx.font = `400 ${44 * k}px ${SANS}`;
      ctx.fillStyle = soft;
      wrap(ctx, card.sub, maxW * 0.9).slice(0, 2).forEach((line, i) => ctx.fillText(line, w / 2, top + lines.length * lineH + 30 * k + i * 58 * k));
    }
  } else if (card.kind === 'counter') {
    const run = instant ? 1 : easeOut(local / Math.min(1.4, span * 0.75));
    ctx.font = `600 ${(tall ? 230 : 260) * k}px ${SERIF}`;
    ctx.fillStyle = text;
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 30 * k;
    ctx.fillText(`${card.prefix}${formatNumber(card.value * run, card.decimals)}${card.suffix}`, w / 2, h / 2 + 40 * k + rise);
    ctx.shadowBlur = 0;
    if (card.label) {
      ctx.font = `400 ${46 * k}px ${SANS}`;
      ctx.fillStyle = soft;
      wrap(ctx, card.label, maxW).slice(0, 2).forEach((line, i) => ctx.fillText(line, w / 2, h / 2 + 140 * k + i * 60 * k));
    }
  } else if (card.kind === 'picture' || card.kind === 'shot') {
    // A framed print (picture) or a browser window (the real site), floating with a slow drift.
    const fw = card.kind === 'shot' ? (tall ? w - 120 * k : w * 0.7) : tall ? w * 0.72 : w * 0.46;
    const fh = card.kind === 'shot' ? (tall ? h * 0.6 : h * 0.72) : fw * 1.2;
    const drift = Math.sin(seed + local * 0.6) * 10 * k;
    const x = (w - fw) / 2;
    const y = (h - fh) / 2 + rise + drift;
    const scale = 0.96 + 0.04 * a + 0.03 * clamp(local / Math.max(1, span));
    ctx.translate(w / 2, h / 2);
    ctx.scale(scale, scale);
    ctx.translate(-w / 2, -h / 2);
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 60 * k;
    ctx.shadowOffsetY = 30 * k;
    roundRect(ctx, x, y, fw, fh, 22 * k);
    ctx.fillStyle = '#111';
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.save();
    roundRect(ctx, x, y, fw, fh, 22 * k);
    ctx.clip();
    if (card.kind === 'shot') {
      const bar = 46 * k;
      ctx.fillStyle = '#f2efe9';
      ctx.fillRect(x, y, fw, bar);
      ctx.fillStyle = '#5b5751';
      ctx.font = `500 ${20 * k}px ${SANS}`;
      ctx.fillText(card.host, w / 2, y + bar / 2 + 7 * k);
      const s = Math.max(fw / card.image.width, (fh - bar) / card.image.height);
      const travel = card.scroll ? Math.max(0, card.image.height * s - (fh - bar)) * 0.5 : 0;
      ctx.drawImage(card.image, x + (fw - card.image.width * s) / 2, y + bar - travel * easeInOut((local - 0.6) / Math.max(1, span - 1)), card.image.width * s, card.image.height * s);
    } else {
      coverImage(ctx, card.image, x, y, fw, fh, 1.02 + 0.05 * clamp(local / Math.max(1, span)), false);
    }
    ctx.restore();
    if (card.kind === 'picture' && card.label) {
      ctx.font = `500 ${40 * k}px ${SANS}`;
      ctx.fillStyle = soft;
      ctx.fillText(wrap(ctx, card.label, maxW)[0] ?? '', w / 2, y + fh + 70 * k);
    }
  } else if (card.kind === 'step') {
    ctx.font = `600 ${34 * k}px ${SANS}`;
    setSpacing(ctx, 8 * k);
    ctx.fillStyle = look.accent;
    ctx.fillText(`STEP ${String(card.n).padStart(2, '0')}`, w / 2, h / 2 - 120 * k + rise);
    setSpacing(ctx, 0);
    const { lines, size } = fitBig(ctx, card.text, (s) => `600 ${s}px ${SERIF}`, maxW, h * 0.3, 2, 104 * k, 54 * k);
    ctx.font = `600 ${size}px ${SERIF}`;
    ctx.fillStyle = text;
    lines.forEach((line, i) => ctx.fillText(line, w / 2, h / 2 + i * size * 1.06 + rise));
    if (card.sub) {
      ctx.font = `400 ${42 * k}px ${SANS}`;
      ctx.fillStyle = soft;
      ctx.fillText(wrap(ctx, card.sub, maxW)[0] ?? '', w / 2, h / 2 + lines.length * size * 1.06 + 40 * k);
    }
  } else {
    const name = card.name || card.host || card.line;
    const { lines, size } = fitBig(ctx, name, (s) => `600 ${s}px ${SERIF}`, maxW, h * 0.3, 2, (tall ? 150 : 170) * k, 64 * k);
    ctx.font = `600 ${size}px ${SERIF}`;
    ctx.fillStyle = text;
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 30 * k;
    let y = h / 2 - 120 * k;
    lines.forEach((line, i) => ctx.fillText(line, w / 2, y + i * size * 1.04));
    y += lines.length * size * 1.04;
    ctx.shadowBlur = 0;
    const lineBelow = card.name || card.host ? card.line : '';
    if (lineBelow) {
      ctx.globalAlpha *= clamp((local - 0.5) / 0.6);
      ctx.font = `400 ${46 * k}px ${SANS}`;
      ctx.fillStyle = soft;
      wrap(ctx, lineBelow, maxW).slice(0, 2).forEach((line, i) => ctx.fillText(line, w / 2, y + 10 * k + i * 60 * k));
      y += 140 * k;
    }
    if (card.button) {
      const b = easeOut((local - 1) / 0.6);
      ctx.globalAlpha = b;
      ctx.font = `600 ${42 * k}px ${SANS}`;
      const bw = ctx.measureText(card.button).width + 100 * k;
      const bh = 100 * k;
      roundRect(ctx, w / 2 - bw / 2, y, bw, bh, bh / 2);
      ctx.strokeStyle = text;
      ctx.lineWidth = 3 * k;
      ctx.stroke();
      ctx.fillStyle = text;
      ctx.fillText(card.button, w / 2, y + bh / 2 + 15 * k);
    }
  }
  ctx.restore();
}

/** Draws the Cinematic frame at time t. backdrops: one picture per scene (the site's or a painted one), reused in turn. */
export function drawCinematicFrame(ctx: CanvasRenderingContext2D, w: number, h: number, scenes: KineticScene[], t: number, look: KineticLook, brand: KineticBrand, beat: number, backdrops: (Img | null)[]): void {
  if (scenes.length === 0) return;
  const k = Math.min(w, h) / 1080;
  const tall = h > w;
  // Cinematic cuts every two beats: calmer, and each card has time to settle before the next.
  const p = pick(scenes, t, beat * 2);
  const scene = scenes[p.index];
  const shots = backdrops.filter(Boolean) as Img[];
  const backdropOf = (i: number) => (shots.length ? shots[i % shots.length] : null);
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#0b0908';
  ctx.fillRect(0, 0, w, h);
  // Scene changes dissolve over 0.7s; within a scene the picture keeps pushing in.
  const fade = p.index > 0 ? clamp(p.local / 0.7) : 1;
  if (fade < 1) cinematicBackdrop(ctx, w, h, backdropOf(p.index - 1), 1, look, 1);
  cinematicBackdrop(ctx, w, h, backdropOf(p.index), clamp(p.local / Math.max(1, scene.seconds)), look, fade);
  // Grade: warm darkening from the bottom, a vignette, a whisper of the accent.
  const grade = ctx.createLinearGradient(0, 0, 0, h);
  grade.addColorStop(0, 'rgba(10,8,6,0.35)');
  grade.addColorStop(0.55, 'rgba(10,8,6,0.45)');
  grade.addColorStop(1, 'rgba(10,8,6,0.82)');
  ctx.fillStyle = grade;
  ctx.fillRect(0, 0, w, h);
  const vig = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = rgba(look.accent, 0.08);
  ctx.fillRect(0, 0, w, h);
  if (p.card) cinematicCard(ctx, w, h, k, tall, p.card, p.cardLocal, p.span, p.first, look, p.n * 1.7);
  // Film bars and the brand, quiet.
  const bar = (tall ? 70 : 54) * k;
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, bar);
  ctx.fillRect(0, h - bar, w, bar);
  if (brand.name && p.card?.kind !== 'close') {
    ctx.fillStyle = 'rgba(251,246,240,0.7)';
    ctx.textAlign = 'left';
    ctx.font = `600 ${24 * k}px ${SANS}`;
    setSpacing(ctx, 4 * k);
    ctx.fillText(brand.name.toUpperCase(), 48 * k, bar - 18 * k + (tall ? 0 : 0));
    setSpacing(ctx, 0);
  }
  rail(ctx, w, h, k, t, totalSeconds(scenes), look.accent, 'rgba(255,255,255,0.12)');
}

// ============================================================================================ Glow

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = m ? parseInt(m[1], 16) : 0xff6a2b;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function glowField(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, look: KineticLook): void {
  ctx.fillStyle = '#06070b';
  ctx.fillRect(0, 0, w, h);
  const [r, g, b] = hexToRgb(look.accent);
  const blobs: [number, number, number, string][] = [
    [0.25 + 0.12 * Math.sin(t * 0.31), 0.3 + 0.08 * Math.cos(t * 0.23), 0.55, `${r},${g},${b}`],
    [0.75 + 0.1 * Math.cos(t * 0.27), 0.65 + 0.1 * Math.sin(t * 0.19), 0.5, '70,90,255'],
    [0.55 + 0.15 * Math.sin(t * 0.17 + 2), 0.15 + 0.06 * Math.sin(t * 0.29), 0.38, '40,210,220'],
  ];
  for (const [x, y, radius, color] of blobs) {
    const g2 = ctx.createRadialGradient(x * w, y * h, 0, x * w, y * h, Math.max(w, h) * radius);
    g2.addColorStop(0, `rgba(${color},0.32)`);
    g2.addColorStop(0.5, `rgba(${color},0.08)`);
    g2.addColorStop(1, `rgba(${color},0)`);
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, w, h);
  }
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, color: string): void {
  ctx.beginPath();
  ctx.moveTo(x, y - s);
  ctx.quadraticCurveTo(x, y, x + s, y);
  ctx.quadraticCurveTo(x, y, x, y + s);
  ctx.quadraticCurveTo(x, y, x - s, y);
  ctx.quadraticCurveTo(x, y, x, y - s);
  ctx.fillStyle = color;
  ctx.fill();
}

/** A glass pill with a glowing gradient edge. */
function glowPill(ctx: CanvasRenderingContext2D, x: number, y: number, pw: number, ph: number, k: number, look: KineticLook): void {
  ctx.save();
  ctx.shadowColor = rgba(look.accent, 0.6);
  ctx.shadowBlur = 40 * k;
  roundRect(ctx, x, y, pw, ph, ph / 2);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fill();
  ctx.shadowBlur = 0;
  const edge = ctx.createLinearGradient(x, y, x + pw, y + ph);
  edge.addColorStop(0, look.accent);
  edge.addColorStop(0.5, '#6f7dff');
  edge.addColorStop(1, '#3ddbe0');
  ctx.strokeStyle = edge;
  ctx.lineWidth = 3 * k;
  ctx.stroke();
  ctx.restore();
}

function glowCard(ctx: CanvasRenderingContext2D, w: number, h: number, k: number, tall: boolean, card: KineticCard, local: number, span: number, instant: boolean, look: KineticLook, t: number): void {
  const a = instant ? 1 : easeOut(local / 0.4);
  const margin = (tall ? 80 : 160) * k;
  const maxW = w - margin * 2;
  ctx.save();
  ctx.globalAlpha *= a;
  ctx.filter = a < 1 ? `blur(${(1 - a) * 12 * k}px)` : 'none';
  ctx.textAlign = 'center';
  const white = '#f3f5ff';
  const dim = 'rgba(243,245,255,0.72)';
  const cy = h / 2;
  // A thin line with a travelling dot leads into every card.
  ctx.strokeStyle = 'rgba(243,245,255,0.35)';
  ctx.lineWidth = 2 * k;
  ctx.beginPath();
  ctx.moveTo(w * 0.12, h * 0.86);
  ctx.bezierCurveTo(w * 0.1, h * 0.62, w * 0.42, h * 0.72, w / 2, cy + 120 * k);
  ctx.stroke();
  const dot = clamp(local / Math.max(0.6, span));
  const bx = (u: number, p0: number, p1: number, p2: number, p3: number) => (1 - u) ** 3 * p0 + 3 * (1 - u) ** 2 * u * p1 + 3 * (1 - u) * u * u * p2 + u ** 3 * p3;
  ctx.fillStyle = white;
  ctx.shadowColor = white;
  ctx.shadowBlur = 16 * k;
  ctx.beginPath();
  ctx.arc(bx(dot, w * 0.12, w * 0.1, w * 0.42, w / 2), bx(dot, h * 0.86, h * 0.62, h * 0.72, cy + 120 * k), 7 * k, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  if (card.kind === 'words' && card.text.length <= 30 && !card.sub) {
    ctx.font = `500 ${(tall ? 56 : 60) * k}px ${SANS}`;
    const tw = Math.min(maxW - 140 * k, ctx.measureText(card.text).width);
    const ph = 120 * k;
    const pw = (tw + 170 * k) * (0.6 + 0.4 * a);
    glowPill(ctx, w / 2 - pw / 2, cy - ph / 2, pw, ph, k, look);
    star(ctx, w / 2 - pw / 2 + 62 * k, cy, 18 * k, white);
    ctx.fillStyle = card.strike ? dim : white;
    ctx.textAlign = 'left';
    ctx.fillText(card.text, w / 2 - pw / 2 + 102 * k, cy + 20 * k, pw - 140 * k);
    if (card.strike) {
      const s = easeOut((local - span * 0.45) / 0.35);
      ctx.fillStyle = look.accent;
      ctx.fillRect(w / 2 - pw / 2 + 100 * k, cy - 2 * k, (pw - 150 * k) * s, 4 * k);
    }
  } else if (card.kind === 'words') {
    const { lines, size } = fitBig(ctx, card.text, (s) => `300 ${s}px ${SANS}`, maxW, h * 0.42, tall ? 5 : 3, (tall ? 104 : 112) * k, 52 * k);
    ctx.font = `300 ${size}px ${SANS}`;
    setSpacing(ctx, -size * 0.02);
    ctx.fillStyle = card.accent ? look.accent : white;
    ctx.shadowColor = rgba(look.accent, 0.5);
    ctx.shadowBlur = 30 * k;
    const lineH = size * 1.1;
    const top = cy - (lines.length * lineH) / 2 + size * 0.8 - (card.sub ? 50 * k : 0);
    lines.forEach((line, i) => ctx.fillText(line, w / 2, top + i * lineH));
    setSpacing(ctx, 0);
    ctx.shadowBlur = 0;
    if (card.sub) {
      ctx.font = `400 ${42 * k}px ${SANS}`;
      ctx.fillStyle = dim;
      wrap(ctx, card.sub, maxW * 0.9).slice(0, 2).forEach((line, i) => ctx.fillText(line, w / 2, top + lines.length * lineH + 40 * k + i * 56 * k));
    }
  } else if (card.kind === 'counter') {
    const run = instant ? 1 : easeOut(local / Math.min(1.4, span * 0.75));
    ctx.font = `200 ${(tall ? 240 : 270) * k}px ${SANS}`;
    ctx.fillStyle = white;
    ctx.shadowColor = rgba(look.accent, 0.8);
    ctx.shadowBlur = 50 * k;
    ctx.fillText(`${card.prefix}${formatNumber(card.value * run, card.decimals)}${card.suffix}`, w / 2, cy + 60 * k);
    ctx.shadowBlur = 0;
    if (card.label) {
      ctx.font = `400 ${44 * k}px ${SANS}`;
      ctx.fillStyle = dim;
      wrap(ctx, card.label, maxW).slice(0, 2).forEach((line, i) => ctx.fillText(line, w / 2, cy + 160 * k + i * 58 * k));
    }
  } else if (card.kind === 'picture' || card.kind === 'shot') {
    const fw = card.kind === 'shot' ? (tall ? w - 140 * k : w * 0.66) : tall ? w * 0.7 : w * 0.42;
    const fh = card.kind === 'shot' ? (tall ? h * 0.56 : h * 0.68) : fw * 1.2;
    const x = (w - fw) / 2;
    const y = cy - fh / 2;
    ctx.save();
    ctx.shadowColor = rgba(look.accent, 0.55);
    ctx.shadowBlur = 50 * k;
    roundRect(ctx, x, y, fw, fh, 26 * k);
    ctx.fillStyle = '#0d0f16';
    ctx.fill();
    ctx.restore();
    ctx.save();
    roundRect(ctx, x, y, fw, fh, 26 * k);
    ctx.clip();
    if (card.kind === 'shot') {
      const s = Math.max(fw / card.image.width, fh / card.image.height);
      const travel = card.scroll ? Math.max(0, card.image.height * s - fh) * 0.5 : 0;
      ctx.drawImage(card.image, x + (fw - card.image.width * s) / 2, y - travel * easeInOut((local - 0.6) / Math.max(1, span - 1)), card.image.width * s, card.image.height * s);
    } else coverImage(ctx, card.image, x, y, fw, fh, 1.03, false);
    ctx.restore();
    glowPill(ctx, x - 2 * k, y - 2 * k, fw + 4 * k, fh + 4 * k, k, look);
  } else if (card.kind === 'step') {
    const ph = 120 * k;
    ctx.font = `500 ${56 * k}px ${SANS}`;
    const pw = Math.min(maxW, ctx.measureText(card.text).width + 220 * k);
    glowPill(ctx, w / 2 - pw / 2, cy - ph / 2, pw, ph, k, look);
    ctx.beginPath();
    ctx.arc(w / 2 - pw / 2 + 64 * k, cy, 36 * k, 0, Math.PI * 2);
    ctx.fillStyle = look.accent;
    ctx.fill();
    ctx.fillStyle = '#06070b';
    ctx.font = `700 ${40 * k}px ${SANS}`;
    ctx.fillText(String(card.n), w / 2 - pw / 2 + 64 * k, cy + 14 * k);
    ctx.fillStyle = white;
    ctx.textAlign = 'left';
    ctx.font = `500 ${56 * k}px ${SANS}`;
    ctx.fillText(card.text, w / 2 - pw / 2 + 124 * k, cy + 20 * k, pw - 160 * k);
    if (card.sub) {
      ctx.textAlign = 'center';
      ctx.font = `400 ${40 * k}px ${SANS}`;
      ctx.fillStyle = dim;
      ctx.fillText(wrap(ctx, card.sub, maxW)[0] ?? '', w / 2, cy + ph + 20 * k);
    }
  } else {
    const name = card.name || card.host || card.line;
    const { lines, size } = fitBig(ctx, name, (s) => `300 ${s}px ${SANS}`, maxW, h * 0.3, 2, (tall ? 140 : 160) * k, 60 * k);
    ctx.font = `300 ${size}px ${SANS}`;
    ctx.fillStyle = white;
    ctx.shadowColor = rgba(look.accent, 0.6);
    ctx.shadowBlur = 40 * k;
    let y = cy - 160 * k;
    lines.forEach((line, i) => ctx.fillText(line, w / 2, y + i * size * 1.06));
    y += lines.length * size * 1.06;
    ctx.shadowBlur = 0;
    const lineBelow = card.name || card.host ? card.line : '';
    if (lineBelow) {
      ctx.font = `400 ${44 * k}px ${SANS}`;
      ctx.fillStyle = dim;
      wrap(ctx, lineBelow, maxW).slice(0, 2).forEach((line, i) => ctx.fillText(line, w / 2, y + 10 * k + i * 58 * k));
      y += 130 * k;
    }
    if (card.button) {
      const ph = 110 * k;
      ctx.font = `600 ${46 * k}px ${SANS}`;
      const pw = ctx.measureText(card.button).width + 140 * k;
      const b = easeOut((local - 0.9) / 0.6);
      ctx.globalAlpha = b;
      glowPill(ctx, w / 2 - pw / 2, y, pw, ph, k, look);
      ctx.fillStyle = white;
      ctx.fillText(card.button, w / 2, y + ph / 2 + 16 * k);
    }
  }
  ctx.restore();
  void t;
}

/** Draws the Glow frame at time t. */
export function drawGlowFrame(ctx: CanvasRenderingContext2D, w: number, h: number, scenes: KineticScene[], t: number, look: KineticLook, brand: KineticBrand, beat: number): void {
  if (scenes.length === 0) return;
  const k = Math.min(w, h) / 1080;
  const tall = h > w;
  const p = pick(scenes, t, beat);
  ctx.globalAlpha = 1;
  glowField(ctx, w, h, t, look);
  if (p.card) glowCard(ctx, w, h, k, tall, p.card, p.cardLocal, p.span, p.first, look, t);
  ctx.globalAlpha = 1;
  ctx.filter = 'none';
  if (brand.name && p.card?.kind !== 'close') {
    ctx.fillStyle = 'rgba(243,245,255,0.6)';
    ctx.textAlign = 'left';
    ctx.font = `500 ${26 * k}px ${SANS}`;
    ctx.fillText(brand.name, 52 * k, (tall ? 110 : 70) * k);
  }
  rail(ctx, w, h, k, t, totalSeconds(scenes), look.accent, 'rgba(243,245,255,0.12)');
}
