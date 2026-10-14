'use client';

import { sceneAt, totalSeconds } from '@/lib/video-scenes.js';
import type { LaunchScene } from '@/lib/launch-video.js';

// Launch video frames. Each scene of the story has its own shot, drawn on a canvas in the brand's colours with motion
// timed inside the scene: words rise in one by one, chips get struck through, the real site scrolls in a browser window,
// tiles pop in, the steps fill along a line, real pictures settle into a grid, and the close lands on the button.

export type LaunchLook = { bg: string; text: string; accent: string; dark: boolean };
export type LaunchMedia = { name: string; host: string; shot: ImageBitmap | null; pictures: { image: ImageBitmap; label: string }[] };
type Img = CanvasImageSource & { width: number; height: number };

const SERIF = 'BFFraunces, Georgia, serif';
const SANS = 'BFInter, system-ui, sans-serif';

/** Loads the two faces launch videos are drawn with (once per page). */
let fontsLoading: Promise<void> | null = null;
export function loadLaunchFonts(): Promise<void> {
  fontsLoading ??= Promise.all(
    ([['BFFraunces', '/fonts/fraunces-latin-variable.woff2', '100 900'], ['BFInter', '/fonts/inter-latin-variable.woff2', '100 900']] as const).map(async ([family, url, weight]) => {
      try {
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
const backOut = (x: number) => {
  const v = clamp(x);
  const c = 1.7;
  return 1 + (c + 1) * Math.pow(v - 1, 3) + c * Math.pow(v - 1, 2);
};

function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a: string, b: string, share: number): string {
  const [r1, g1, b1] = hexRgb(a);
  const [r2, g2, b2] = hexRgb(b);
  const m = (x: number, y: number) => Math.round(x + (y - x) * share);
  return `rgb(${m(r1, r2)},${m(g1, g2)},${m(b1, b2)})`;
}

function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

function rounded(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
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

/** Fits text into maxWidth over at most maxLines lines, shrinking the size until it does. */
function fit(ctx: CanvasRenderingContext2D, text: string, font: (size: number) => string, size: number, maxWidth: number, maxLines: number, min: number): { lines: string[]; size: number } {
  let s = size;
  ctx.font = font(s);
  let lines = wrap(ctx, text, maxWidth);
  while ((lines.length > maxLines || lines.some((line) => ctx.measureText(line).width > maxWidth)) && s > min) {
    s = Math.max(min, s - 4);
    ctx.font = font(s);
    lines = wrap(ctx, text, maxWidth);
  }
  return { lines, size: s };
}

function cover(ctx: CanvasRenderingContext2D, image: Img, x: number, y: number, w: number, h: number, zoom = 1, top = false): void {
  const scale = Math.max(w / image.width, h / image.height) * zoom;
  const dw = image.width * scale;
  const dh = image.height * scale;
  ctx.drawImage(image, x + (w - dw) / 2, top ? y : y + (h - dh) / 2, dw, dh);
}

type Frame = { ctx: CanvasRenderingContext2D; w: number; h: number; k: number; tall: boolean; look: LaunchLook; panel: string; line: string; muted: string; media: LaunchMedia };

/** A centred heading near the top, rising in at `at` seconds. Returns the y below it. */
function heading(f: Frame, text: string, local: number, at: number, top: number): number {
  const { ctx, w, k, tall } = f;
  const { lines, size } = fit(ctx, text, (s) => `600 ${s}px ${SERIF}`, (tall ? 92 : 84) * k, w - (tall ? 120 : 260) * k, 2, 48 * k);
  const a = easeOut((local - at) / 0.6);
  const saved = ctx.globalAlpha;
  ctx.globalAlpha = saved * a;
  ctx.fillStyle = f.look.text;
  ctx.textAlign = 'center';
  ctx.font = `600 ${size}px ${SERIF}`;
  let y = top + size * 0.9 + (1 - a) * 40 * k;
  for (const line of lines) {
    ctx.fillText(line, w / 2, y);
    y += size * 1.08;
  }
  ctx.globalAlpha = saved;
  return top + lines.length * size * 1.08 + 20 * k;
}

function hook(f: Frame, s: Extract<LaunchScene, { kind: 'hook' }>, local: number): void {
  const { ctx, w, h, k, tall, look } = f;
  const font = (size: number) => `600 ${size}px ${SERIF}`;
  const { lines, size } = fit(ctx, s.heading, font, (tall ? 136 : 150) * k, w - (tall ? 110 : 240) * k, tall ? 5 : 3, 60 * k);
  const lineH = size * 1.06;
  ctx.font = `500 ${46 * k}px ${SANS}`;
  const subLines = s.sub ? wrap(ctx, s.sub, w - 260 * k) : [];
  const block = lines.length * lineH + (subLines.length ? 50 * k + subLines.length * 60 * k : 0);
  let y = (h - block) / 2 + size * 0.85;
  const accent = s.accent.toLowerCase();
  let index = 0;
  ctx.textAlign = 'left';
  const base = ctx.globalAlpha;
  for (const line of lines) {
    ctx.font = font(size);
    const words = line.split(' ');
    const space = ctx.measureText(' ').width;
    const width = words.reduce((sum, word) => sum + ctx.measureText(word).width, 0) + space * (words.length - 1);
    let x = (w - width) / 2;
    for (const word of words) {
      const a = easeOut((local - 0.2 - index * 0.13) / 0.55);
      ctx.globalAlpha = base * a;
      ctx.fillStyle = accent && word.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '') === accent.replace(/[^\p{L}\p{N}]/gu, '') ? look.accent : look.text;
      ctx.fillText(word, x, y + (1 - a) * 60 * k);
      x += ctx.measureText(word).width + space;
      index += 1;
    }
    y += lineH;
  }
  if (subLines.length) {
    const a = easeOut((local - 0.4 - index * 0.13) / 0.6);
    ctx.globalAlpha = base * a;
    ctx.fillStyle = f.muted;
    ctx.textAlign = 'center';
    ctx.font = `500 ${46 * k}px ${SANS}`;
    y += 50 * k - lineH + 46 * k;
    for (const line of subLines) {
      ctx.fillText(line, w / 2, y + (1 - a) * 30 * k);
      y += 60 * k;
    }
  }
  ctx.globalAlpha = base;
}

function problem(f: Frame, s: Extract<LaunchScene, { kind: 'problem' }>, local: number): void {
  const { ctx, w, h, k, look } = f;
  const below = heading(f, s.heading, local, 0.1, h / 2 - (f.tall ? 320 : 220) * k);
  ctx.font = `600 ${42 * k}px ${SANS}`;
  const padX = 40 * k;
  const chipH = 96 * k;
  const gap = 22 * k;
  const widths = s.chips.map((chip) => ctx.measureText(chip).width + padX * 2);
  const rows: number[][] = [[]];
  let rowW = 0;
  widths.forEach((cw, i) => {
    if (rowW + cw > w - 160 * k && rows[rows.length - 1].length) {
      rows.push([]);
      rowW = 0;
    }
    rows[rows.length - 1].push(i);
    rowW += cw + gap;
  });
  const strikeAt = Math.max(1.4, s.seconds * 0.5);
  const base = ctx.globalAlpha;
  rows.forEach((row, r) => {
    const total = row.reduce((sum, i) => sum + widths[i], 0) + gap * (row.length - 1);
    let x = (w - total) / 2;
    const y = below + 50 * k + r * (chipH + gap);
    for (const i of row) {
      const a = backOut((local - 0.5 - i * 0.12) / 0.45);
      const dim = 1 - 0.6 * easeOut((local - strikeAt - i * 0.1) / 0.4);
      ctx.globalAlpha = base * clamp(a) * dim;
      rounded(ctx, x, y + (1 - clamp(a)) * 30 * k, widths[i], chipH, chipH / 2);
      ctx.fillStyle = f.panel;
      ctx.fill();
      ctx.strokeStyle = f.line;
      ctx.lineWidth = 2 * k;
      ctx.stroke();
      ctx.fillStyle = look.text;
      ctx.textAlign = 'center';
      ctx.font = `600 ${42 * k}px ${SANS}`;
      ctx.fillText(s.chips[i], x + widths[i] / 2, y + chipH / 2 + 15 * k);
      const strike = easeOut((local - strikeAt - i * 0.1) / 0.35);
      if (strike > 0) {
        ctx.globalAlpha = base * clamp(a);
        ctx.fillStyle = look.accent;
        ctx.fillRect(x + 20 * k, y + chipH / 2 - 2 * k, (widths[i] - 40 * k) * strike, 4 * k);
      }
      x += widths[i] + gap;
    }
  });
  ctx.globalAlpha = base;
}

function tour(f: Frame, s: Extract<LaunchScene, { kind: 'tour' }>, local: number): void {
  const { ctx, w, h, k, tall, look, media } = f;
  const below = heading(f, s.heading, local, 0.1, tall ? 150 * k : 70 * k);
  const fw = tall ? w - 100 * k : Math.min(w - 300 * k, 1500 * k);
  const fh = h - below - (tall ? 200 : 90) * k;
  const fx = (w - fw) / 2;
  const a = easeOut((local - 0.25) / 0.7);
  const fy = below + 20 * k + (1 - a) * 80 * k;
  const base = ctx.globalAlpha;
  ctx.globalAlpha = base * a;
  // The browser window.
  rounded(ctx, fx, fy, fw, fh, 24 * k);
  ctx.fillStyle = f.panel;
  ctx.fill();
  ctx.strokeStyle = f.line;
  ctx.lineWidth = 2 * k;
  ctx.stroke();
  const bar = 64 * k;
  [0, 1, 2].forEach((i) => {
    ctx.beginPath();
    ctx.arc(fx + 34 * k + i * 26 * k, fy + bar / 2, 8 * k, 0, Math.PI * 2);
    ctx.fillStyle = f.line;
    ctx.fill();
  });
  const pillW = Math.min(fw * 0.5, 620 * k);
  rounded(ctx, fx + (fw - pillW) / 2, fy + 14 * k, pillW, bar - 28 * k, (bar - 28 * k) / 2);
  ctx.fillStyle = rgba(look.bg, 0.6);
  ctx.fill();
  ctx.fillStyle = f.muted;
  ctx.textAlign = 'center';
  ctx.font = `500 ${24 * k}px ${SANS}`;
  ctx.fillText(media.host || media.name, fx + fw / 2, fy + bar / 2 + 8 * k);
  // The page, scrolling slowly from the top.
  const vx = fx + 2 * k;
  const vy = fy + bar;
  const vw = fw - 4 * k;
  const vh = fh - bar - 2 * k;
  ctx.save();
  rounded(ctx, vx, vy, vw, vh, 20 * k);
  ctx.clip();
  const shot: Img | null = media.shot ?? media.pictures[0]?.image ?? null;
  if (shot) {
    // Full width, and never shorter than the window (a short page is shown a little larger instead).
    const scale = Math.max(vw / shot.width, vh / shot.height);
    const travel = Math.max(0, shot.height * scale - vh);
    const scroll = travel * 0.75 * easeInOut((local - 0.9) / Math.max(1, s.seconds - 1.4));
    if (media.shot) ctx.drawImage(shot, vx + (vw - shot.width * scale) / 2, vy - scroll, shot.width * scale, shot.height * scale);
    else cover(ctx, shot, vx, vy, vw, vh, 1.04 + 0.05 * clamp(local / s.seconds));
  } else {
    ctx.fillStyle = look.bg;
    ctx.fillRect(vx, vy, vw, vh);
    ctx.fillStyle = look.text;
    ctx.font = `600 ${110 * k}px ${SERIF}`;
    ctx.fillText(media.name || media.host, w / 2, vy + vh / 2 + 36 * k);
  }
  ctx.restore();
  ctx.globalAlpha = base;
}

function tiles(f: Frame, s: Extract<LaunchScene, { kind: 'features' }>, local: number): void {
  const { ctx, w, h, k, tall, look } = f;
  const below = heading(f, s.heading, local, 0.1, tall ? 200 * k : 110 * k);
  const cols = tall ? 2 : Math.min(3, s.items.length);
  const rows = Math.ceil(s.items.length / cols);
  const gap = 28 * k;
  const tw = Math.min(460 * k, (w - (tall ? 100 : 240) * k - gap * (cols - 1)) / cols);
  const th = Math.min(tall ? 300 * k : 250 * k, (h - below - 140 * k - gap * (rows - 1)) / rows);
  const gx = (w - (tw * cols + gap * (cols - 1))) / 2;
  const gy = below + 40 * k + Math.max(0, (h - below - 140 * k - (th * rows + gap * (rows - 1))) / 2);
  const base = ctx.globalAlpha;
  s.items.forEach((item, i) => {
    const a = backOut((local - 0.5 - i * 0.16) / 0.5);
    const x = gx + (i % cols) * (tw + gap);
    const y = gy + Math.floor(i / cols) * (th + gap) + (1 - clamp(a)) * 40 * k;
    ctx.globalAlpha = base * clamp(a);
    rounded(ctx, x, y, tw, th, 24 * k);
    ctx.fillStyle = f.panel;
    ctx.fill();
    ctx.strokeStyle = f.line;
    ctx.lineWidth = 2 * k;
    ctx.stroke();
    ctx.fillStyle = look.accent;
    rounded(ctx, x + 30 * k, y + 32 * k, 64 * k, 10 * k, 5 * k);
    ctx.fill();
    ctx.textAlign = 'left';
    const title = fit(ctx, item.title, (sz) => `700 ${sz}px ${SANS}`, 38 * k, tw - 60 * k, 2, 26 * k);
    ctx.fillStyle = look.text;
    ctx.font = `700 ${title.size}px ${SANS}`;
    let ty = y + 70 * k + title.size;
    for (const line of title.lines) {
      ctx.fillText(line, x + 30 * k, ty);
      ty += title.size * 1.15;
    }
    if (item.note) {
      ctx.font = `500 ${26 * k}px ${SANS}`;
      ctx.fillStyle = f.muted;
      for (const line of wrap(ctx, item.note, tw - 60 * k).slice(0, 3)) {
        ty += 8 * k;
        if (ty + 26 * k > y + th - 14 * k) break;
        ctx.fillText(line, x + 30 * k, ty + 26 * k);
        ty += 26 * k * 1.2;
      }
    }
  });
  ctx.globalAlpha = base;
}

function steps(f: Frame, s: Extract<LaunchScene, { kind: 'steps' }>, local: number): void {
  const { ctx, w, h, k, tall, look } = f;
  const below = heading(f, s.heading, local, 0.1, tall ? 260 * k : 250 * k);
  const start = 0.8;
  const span = Math.max(1.2, s.seconds - 1.8);
  const progress = easeInOut((local - start) / span);
  const base = ctx.globalAlpha;
  const r = 40 * k;
  const points = s.items.map((_, i) =>
    tall ? { x: 200 * k, y: below + 120 * k + i * ((h - below - 420 * k) / 2) } : { x: w / 2 + (i - 1) * Math.min(560 * k, (w - 400 * k) / 2), y: below + 160 * k }
  );
  // The line, then the part of it that has filled.
  const [p0, p2] = [points[0], points[points.length - 1]];
  ctx.globalAlpha = base * easeOut((local - 0.3) / 0.5);
  ctx.strokeStyle = f.line;
  ctx.lineWidth = 6 * k;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(p0.x, p0.y);
  ctx.lineTo(p2.x, p2.y);
  ctx.stroke();
  ctx.strokeStyle = look.accent;
  ctx.beginPath();
  ctx.moveTo(p0.x, p0.y);
  ctx.lineTo(p0.x + (p2.x - p0.x) * progress, p0.y + (p2.y - p0.y) * progress);
  ctx.stroke();
  s.items.forEach((item, i) => {
    const p = points[i];
    const reached = progress >= i / (s.items.length - 1) - 0.001;
    const a = easeOut((local - 0.4 - i * 0.2) / 0.5);
    ctx.globalAlpha = base * a;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = reached ? look.accent : f.panel;
    ctx.fill();
    ctx.lineWidth = 5 * k;
    ctx.strokeStyle = reached ? look.accent : f.line;
    ctx.stroke();
    ctx.fillStyle = reached ? look.bg : look.text;
    ctx.textAlign = 'center';
    ctx.font = `700 ${34 * k}px ${SANS}`;
    ctx.fillText(String(i + 1), p.x, p.y + 12 * k);
    ctx.textAlign = tall ? 'left' : 'center';
    const tx = tall ? p.x + r + 40 * k : p.x;
    const maxW = tall ? w - tx - 80 * k : Math.min(500 * k, (w - 300 * k) / 3);
    const title = fit(ctx, item.title, (sz) => `700 ${sz}px ${SANS}`, 40 * k, maxW, 2, 26 * k);
    ctx.fillStyle = look.text;
    ctx.font = `700 ${title.size}px ${SANS}`;
    let ty = tall ? p.y - (item.note ? 10 * k : -14 * k) : p.y + r + 70 * k;
    for (const line of title.lines) {
      ctx.fillText(line, tx, ty);
      ty += title.size * 1.15;
    }
    if (item.note) {
      ctx.fillStyle = f.muted;
      ctx.font = `500 ${28 * k}px ${SANS}`;
      for (const line of wrap(ctx, item.note, maxW).slice(0, 2)) {
        ctx.fillText(line, tx, ty + 6 * k);
        ty += 36 * k;
      }
    }
  });
  ctx.globalAlpha = base;
}

function proof(f: Frame, s: Extract<LaunchScene, { kind: 'proof' }>, local: number): void {
  const { ctx, w, h, k, tall, media } = f;
  const below = heading(f, s.heading, local, 0.1, tall ? 180 * k : 90 * k);
  const pics = media.pictures.slice(0, 6);
  if (pics.length === 0) return;
  const cols = tall ? (pics.length > 3 ? 2 : 1) : pics.length > 4 ? 3 : Math.min(pics.length, pics.length === 4 ? 2 : 3);
  const rows = Math.ceil(pics.length / cols);
  const gap = 26 * k;
  const areaW = w - (tall ? 100 : 220) * k;
  const areaH = h - below - (tall ? 200 : 90) * k;
  let cw = (areaW - gap * (cols - 1)) / cols;
  let ch = cw * 0.62;
  if (ch * rows + gap * (rows - 1) > areaH) {
    ch = (areaH - gap * (rows - 1)) / rows;
    cw = Math.min(cw, ch / 0.62);
  }
  const gx = (w - (cw * cols + gap * (cols - 1))) / 2;
  const gy = below + 20 * k;
  const base = ctx.globalAlpha;
  pics.forEach((pic, i) => {
    const a = easeOut((local - 0.35 - i * 0.12) / 0.55);
    const x = gx + (i % cols) * (cw + gap);
    const y = gy + Math.floor(i / cols) * (ch + gap) + (1 - a) * 50 * k;
    ctx.globalAlpha = base * a;
    ctx.save();
    rounded(ctx, x, y, cw, ch, 18 * k);
    ctx.clip();
    ctx.fillStyle = f.panel;
    ctx.fillRect(x, y, cw, ch);
    cover(ctx, pic.image, x, y, cw, ch, 1 + 0.05 * clamp(local / s.seconds), true);
    if (pic.label) {
      const grad = ctx.createLinearGradient(0, y + ch * 0.55, 0, y + ch);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, 'rgba(0,0,0,0.75)');
      ctx.fillStyle = grad;
      ctx.fillRect(x, y + ch * 0.5, cw, ch * 0.5);
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.font = `600 ${26 * k}px ${SANS}`;
      ctx.fillText(wrap(ctx, pic.label, cw - 40 * k)[0] ?? '', x + 20 * k, y + ch - 20 * k);
    }
    ctx.restore();
    ctx.strokeStyle = f.line;
    ctx.lineWidth = 2 * k;
    rounded(ctx, x, y, cw, ch, 18 * k);
    ctx.stroke();
  });
  ctx.globalAlpha = base;
}

function close(f: Frame, s: Extract<LaunchScene, { kind: 'cta' }>, local: number): void {
  const { ctx, w, h, k, tall, look, media } = f;
  const base = ctx.globalAlpha;
  const name = media.name || media.host;
  const nameFit = fit(ctx, name || ' ', (sz) => `600 ${sz}px ${SERIF}`, (tall ? 150 : 170) * k, w - 200 * k, 1, 60 * k);
  const lineFit = fit(ctx, s.heading, (sz) => `600 ${sz}px ${SERIF}`, (tall ? 70 : 64) * k, w - 220 * k, 3, 36 * k);
  const blockH = (name ? nameFit.size * 1.1 : 0) + lineFit.lines.length * lineFit.size * 1.15 + 200 * k;
  let y = (h - blockH) / 2;
  ctx.textAlign = 'center';
  if (name) {
    const a = easeOut((local - 0.2) / 0.8);
    ctx.globalAlpha = base * a;
    ctx.fillStyle = look.text;
    ctx.font = `600 ${nameFit.size}px ${SERIF}`;
    y += nameFit.size * 0.9;
    ctx.fillText(name, w / 2, y + (1 - a) * 30 * k);
    // A short accent rule under the name.
    ctx.fillStyle = look.accent;
    const rule = 120 * k * easeOut((local - 0.6) / 0.6);
    ctx.fillRect(w / 2 - rule / 2, y + 30 * k, rule, 8 * k);
    y += nameFit.size * 0.3 + 40 * k;
  }
  const la = easeOut((local - 0.8) / 0.6);
  ctx.globalAlpha = base * la;
  ctx.fillStyle = look.text;
  ctx.font = `600 ${lineFit.size}px ${SERIF}`;
  for (const line of lineFit.lines) {
    y += lineFit.size * 1.15;
    ctx.fillText(line, w / 2, y + (1 - la) * 24 * k);
  }
  const ba = backOut((local - 1.6) / 0.5);
  ctx.globalAlpha = base * clamp(ba);
  ctx.font = `700 ${40 * k}px ${SANS}`;
  const bw = ctx.measureText(s.button).width + 110 * k;
  const bh = 100 * k;
  const by = y + 60 * k;
  const grow = 0.85 + 0.15 * ba;
  rounded(ctx, w / 2 - (bw * grow) / 2, by + (bh * (1 - grow)) / 2, bw * grow, bh * grow, 20 * k);
  ctx.fillStyle = look.accent;
  ctx.fill();
  ctx.fillStyle = look.bg;
  ctx.fillText(s.button, w / 2, by + bh / 2 + 14 * k);
  if (media.host) {
    const ha = easeOut((local - 2.1) / 0.5);
    ctx.globalAlpha = base * ha;
    ctx.fillStyle = f.muted;
    ctx.font = `500 ${34 * k}px ${SANS}`;
    ctx.fillText(media.host, w / 2, by + bh + 70 * k);
  }
  ctx.globalAlpha = base;
}

/** Draws the launch video's frame at time t (seconds). */
export function drawLaunchFrame(ctx: CanvasRenderingContext2D, w: number, h: number, scenes: LaunchScene[], t: number, look: LaunchLook, media: LaunchMedia): void {
  if (scenes.length === 0) return;
  const k = Math.min(w, h) / 1080;
  const f: Frame = { ctx, w, h, k, tall: h > w, look, media, panel: mix(look.bg, look.text, 0.06), line: mix(look.bg, look.text, 0.16), muted: mix(look.bg, look.text, 0.66) };
  const { index, local } = sceneAt(scenes, t);
  const scene = scenes[index];
  const total = totalSeconds(scenes);

  // Ground: the brand colour, a faint grid, and a soft accent glow that drifts to a new place each scene.
  ctx.globalAlpha = 1;
  ctx.fillStyle = look.bg;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = rgba(look.text, 0.035);
  ctx.lineWidth = 1;
  const cell = 64 * k;
  ctx.beginPath();
  for (let x = cell; x < w; x += cell) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
  }
  for (let y = cell; y < h; y += cell) {
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
  }
  ctx.stroke();
  const spots = [[0.5, 0.5], [0.8, 0.3], [0.2, 0.4], [0.75, 0.7], [0.3, 0.75], [0.6, 0.25], [0.5, 0.55]];
  const from = spots[(index + spots.length - 1) % spots.length];
  const to = spots[index % spots.length];
  const move = easeInOut(local / 1.4);
  const gx = (from[0] + (to[0] - from[0]) * move) * w;
  const gy = (from[1] + (to[1] - from[1]) * move) * h;
  const radius = Math.max(w, h) * 0.5;
  const glow = ctx.createRadialGradient(gx, gy, 0, gx, gy, radius);
  glow.addColorStop(0, rgba(look.accent, look.dark ? 0.22 : 0.14));
  glow.addColorStop(0.45, rgba(look.accent, look.dark ? 0.06 : 0.04));
  glow.addColorStop(1, rgba(look.accent, 0));
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);

  // The scene: in over a quarter second, out over its last third of a second (the last scene holds).
  const last = index === scenes.length - 1;
  const leave = !last && scene.seconds - local < 0.3 ? easeOut((scene.seconds - local) / 0.3) : 1;
  ctx.globalAlpha = Math.min(easeOut(local / 0.25), leave);
  if (scene.kind === 'hook') hook(f, scene, local);
  else if (scene.kind === 'problem') problem(f, scene, local);
  else if (scene.kind === 'tour') tour(f, scene, local);
  else if (scene.kind === 'features') tiles(f, scene, local);
  else if (scene.kind === 'steps') steps(f, scene, local);
  else if (scene.kind === 'proof') proof(f, scene, local);
  else close(f, scene, local);
  ctx.globalAlpha = 1;

  // The name in the corner (not on the close, which shows it large), and a rail that fills as the video plays.
  if (media.name && scene.kind !== 'cta') {
    ctx.fillStyle = f.muted;
    ctx.textAlign = 'left';
    ctx.font = `600 ${28 * k}px ${SANS}`;
    ctx.fillText(media.name, 56 * k, (h > w ? 110 : 70) * k);
  }
  ctx.fillStyle = rgba(look.text, 0.12);
  ctx.fillRect(0, h - 6 * k, w, 6 * k);
  ctx.fillStyle = look.accent;
  ctx.fillRect(0, h - 6 * k, w * clamp(t / Math.max(0.1, total)), 6 * k);
}
