'use client';

import { sceneAt, totalSeconds } from '@/lib/video-scenes.js';
import type { LaunchScene } from '@/lib/launch-video.js';

// The Kinetic look: motion design instead of slides. Every scene is broken into cards, one idea each, and the cards cut on
// the music's beat: a giant word slams in on a full colour field, the field changes colour on the cut, a moving pattern
// (dots, rings, stripes, glossy orbs) runs behind it, numbers from the story count up, real pictures flash full-bleed and
// the real site scrolls in a tilted window. The words and the timing of the story are the same as the calm look; only the
// way it moves changes. All drawn on a 2D canvas, in the browser.

export type Img = CanvasImageSource & { width: number; height: number };

export type KineticCard =
  | { kind: 'words'; text: string; sub?: string; accent?: boolean; strike?: boolean }
  | { kind: 'counter'; value: number; decimals: number; prefix: string; suffix: string; label: string }
  | { kind: 'picture'; image: Img; label: string }
  | { kind: 'shot'; image: Img; host: string; scroll: boolean; zoom?: number; focus?: number }
  | { kind: 'step'; n: number; text: string; sub: string }
  | { kind: 'close'; name: string; line: string; button: string; host: string };

export type KineticScene = { seconds: number; cards: KineticCard[] };
export type KineticLook = { bg: string; text: string; accent: string; dark: boolean };
export type KineticBrand = { name: string; host: string };

const HEAVY = 'BFAnton, Impact, sans-serif';
const SANS = 'BFInter, system-ui, sans-serif';

/** Loads the faces the Kinetic look is drawn with (once per page). */
let fontsLoading: Promise<void> | null = null;
export function loadKineticFonts(): Promise<void> {
  fontsLoading ??= Promise.all(
    ([['BFAnton', '/fonts/anton-latin-400-normal.woff2', '400'], ['BFInter', '/fonts/inter-latin-variable.woff2', '100 900']] as const).map(async ([family, url, weight]) => {
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
const easeOutExpo = (x: number) => (clamp(x) >= 1 ? 1 : 1 - Math.pow(2, -10 * clamp(x)));

/** A small stable random number from a seed. */
export function rand(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export function hexRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  const n = m ? parseInt(m[1], 16) : 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexRgb(hex);
  return `rgba(${r},${g},${b},${alpha})`;
}

function luminance(hex: string): number {
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  const [r, g, b] = hexRgb(hex);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function hue(hex: string): number {
  const [r, g, b] = hexRgb(hex).map((c) => c / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

/** The fields the cuts move between: the brand's own ink, paper and accent, plus one loud partner and a deep night. */
function palette(look: KineticLook) {
  const ink = look.dark ? look.bg : '#111111';
  const paper = look.dark ? '#f3efe8' : look.bg;
  const h = hue(look.accent);
  // A warm accent pairs with acid lime, a cool one with hot orange: the pairing the eye reads as energy.
  const partner = h < 70 || h > 300 ? '#d7ff3c' : '#ff5a1f';
  return { ink, paper, accent: look.accent, partner, night: '#17143a' };
}

/** Near-black or white, whichever reads better on a field. */
export function onField(field: string): string {
  return luminance(field) > 0.4 ? '#111111' : '#ffffff';
}

type Field = { fill: string; text: string; pop: string };

/** The field for card n of the whole video: mostly ink and accent, with paper, partner and night for contrast. */
function fieldFor(n: number, look: KineticLook): Field {
  const p = palette(look);
  const order = [p.ink, p.accent, p.paper, p.ink, p.partner, p.night, p.accent, p.paper];
  const fill = order[n % order.length];
  const text = onField(fill);
  // The highlight colour on this field: the accent on dark or light fields, the opposite ink on the accent itself.
  const pop = fill === p.accent ? (text === '#111111' ? '#ffffff' : '#111111') : fill === p.partner ? '#111111' : luminance(p.accent) > 0.05 && Math.abs(luminance(p.accent) - luminance(fill)) > 0.12 ? p.accent : p.partner;
  return { fill, text, pop };
}

type Pattern = 'dots' | 'rings' | 'stripes' | 'orbs' | 'grid';
const PATTERNS: Pattern[] = ['dots', 'rings', 'stripes', 'orbs', 'grid'];

function pattern(ctx: CanvasRenderingContext2D, kind: Pattern, w: number, h: number, k: number, t: number, field: Field, look: KineticLook, beat: number): void {
  const p = palette(look);
  const pulse = 1 - easeOut((t % beat) / beat) * 0.35;
  ctx.save();
  if (kind === 'dots') {
    const cell = 90 * k;
    const colors = [p.accent, p.partner, field.text, p.paper];
    const drift = (t * 40 * k) % cell;
    for (let y = -cell; y < h + cell; y += cell) {
      for (let x = -cell; x < w + cell; x += cell) {
        const i = Math.round(x / cell) * 7 + Math.round(y / cell) * 13;
        ctx.globalAlpha = 0.18;
        ctx.fillStyle = colors[Math.abs(i) % colors.length];
        ctx.beginPath();
        ctx.arc(x + drift, y + cell / 2, 18 * k * pulse, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else if (kind === 'rings') {
    ctx.strokeStyle = field.text;
    ctx.lineWidth = 10 * k;
    const gap = 120 * k;
    const grow = (t * 160 * k) % gap;
    ctx.globalAlpha = 0.13;
    for (let r = grow; r < Math.max(w, h); r += gap) {
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2);
      ctx.stroke();
    }
  } else if (kind === 'stripes') {
    ctx.fillStyle = field.text;
    ctx.globalAlpha = 0.09;
    const gap = 110 * k;
    const slide = (t * 180 * k) % (gap * 2);
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-Math.PI / 5);
    const span = Math.hypot(w, h);
    for (let x = -span - gap * 2 + slide; x < span; x += gap * 2) ctx.fillRect(x, -span, gap, span * 2);
  } else if (kind === 'grid') {
    ctx.strokeStyle = field.text;
    ctx.globalAlpha = 0.08;
    ctx.lineWidth = 2 * k;
    const cell = 120 * k;
    const shift = (t * 60 * k) % cell;
    ctx.beginPath();
    for (let x = -cell + shift; x < w + cell; x += cell) {
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    for (let y = -cell + shift; y < h + cell; y += cell) {
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
    }
    ctx.stroke();
  } else {
    // Glossy orbs on a slow orbit, nearer ones larger and drawn last: a little depth without any 3D engine.
    const colors = [p.accent, p.partner, '#7b6cff', p.paper];
    const orbs = [0, 1, 2, 3, 4].map((i) => {
      const angle = t * 0.9 + (i * Math.PI * 2) / 5;
      const z = (Math.sin(angle) + 1) / 2;
      return { i, x: w / 2 + Math.cos(angle) * w * 0.32, y: h / 2 + Math.sin(angle * 1.3) * h * 0.18, z };
    });
    orbs.sort((a, b) => a.z - b.z);
    for (const orb of orbs) {
      const r = (70 + 90 * orb.z) * k;
      const base = colors[orb.i % colors.length];
      const g = ctx.createRadialGradient(orb.x - r * 0.35, orb.y - r * 0.4, r * 0.1, orb.x, orb.y, r);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.25, base);
      g.addColorStop(1, rgba(base === '#ffffff' ? '#999999' : base, 0.55));
      ctx.globalAlpha = 0.55 + 0.4 * orb.z;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(orb.x, orb.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

export function setSpacing(ctx: CanvasRenderingContext2D, px: number): void {
  const c = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  if ('letterSpacing' in c) c.letterSpacing = `${px}px`;
}

export function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
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

/** The biggest size at which text fits the box in at most maxLines lines. */
export function fitBig(ctx: CanvasRenderingContext2D, text: string, font: (size: number) => string, maxW: number, maxH: number, maxLines: number, start: number, min: number): { lines: string[]; size: number } {
  let size = start;
  for (;;) {
    ctx.font = font(size);
    const lines = wrap(ctx, text, maxW);
    const fits = lines.length <= maxLines && lines.every((line) => ctx.measureText(line).width <= maxW) && lines.length * size * 0.98 <= maxH;
    if (fits || size <= min) return { lines, size };
    size = Math.max(min, size * 0.92);
  }
}

type Entrance = 'slam' | 'split' | 'scatter' | 'rise';
const ENTRANCES: Entrance[] = ['slam', 'split', 'scatter', 'rise'];

/** Draws centred lines of heavy type with an entrance at progress a (0 to 1). */
function bigLines(ctx: CanvasRenderingContext2D, lines: string[], size: number, cx: number, cy: number, a: number, entrance: Entrance, color: string, w: number, k: number, seed: number): void {
  const lineH = size * 0.98;
  const top = cy - (lines.length * lineH) / 2 + size * 0.82;
  ctx.textAlign = 'center';
  ctx.font = `${size}px ${HEAVY}`;
  setSpacing(ctx, -size * 0.01);
  ctx.fillStyle = color;
  lines.forEach((line, li) => {
    const y = top + li * lineH;
    if (entrance === 'slam') {
      const s = 1 + 0.35 * (1 - easeOutExpo(a));
      ctx.save();
      ctx.globalAlpha *= clamp(a * 3);
      ctx.translate(cx, y - size * 0.35);
      ctx.scale(s, s);
      ctx.fillText(line, 0, size * 0.35);
      ctx.restore();
    } else if (entrance === 'split') {
      // The top half slides in from one side, the bottom half from the other, meeting on the beat.
      const off = (1 - easeOutExpo(a)) * w * 0.6 * (li % 2 === 0 ? 1 : -1);
      for (const [half, dir] of [[0, -1], [1, 1]] as const) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, y - size * 0.82 + half * size * 0.45, w, size * 0.45 + (half ? size * 0.2 : 0));
        ctx.clip();
        ctx.fillText(line, cx + off * dir, y);
        ctx.restore();
      }
    } else if (entrance === 'scatter') {
      // Letters fly in from scattered places and land in order.
      const width = ctx.measureText(line).width;
      let x = cx - width / 2;
      ctx.textAlign = 'left';
      [...line].forEach((ch, ci) => {
        const local = clamp((a - ci * 0.025) / 0.6);
        const e = easeOutExpo(local);
        const dx = (rand(seed + ci * 3 + li) - 0.5) * w * 0.5 * (1 - e);
        const dy = (rand(seed + ci * 5 + li + 1) - 0.5) * size * 3 * (1 - e);
        ctx.save();
        ctx.globalAlpha *= clamp(local * 2);
        ctx.translate(x + dx, y + dy);
        ctx.rotate((rand(seed + ci) - 0.5) * 1.2 * (1 - e));
        ctx.fillText(ch, 0, 0);
        ctx.restore();
        x += ctx.measureText(ch).width;
      });
      ctx.textAlign = 'center';
    } else {
      const e = easeOutExpo(clamp((a - li * 0.12) / 0.8));
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, y - size * 0.95, w, size * 1.15);
      ctx.clip();
      ctx.fillText(line, cx, y + (1 - e) * size * 1.1);
      ctx.restore();
    }
  });
  setSpacing(ctx, 0);
}

function subLine(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, maxW: number, k: number, a: number, color: string): number {
  ctx.font = `600 ${50 * k}px ${SANS}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = color;
  const lines = wrap(ctx, text, maxW).slice(0, 3);
  const saved = ctx.globalAlpha;
  ctx.globalAlpha = saved * easeOut(a);
  lines.forEach((line, i) => ctx.fillText(line, cx, y + i * 64 * k + (1 - easeOut(a)) * 20 * k));
  ctx.globalAlpha = saved;
  return y + lines.length * 64 * k;
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, Math.min(r, w / 2, h / 2));
}

export function coverImage(ctx: CanvasRenderingContext2D, image: Img, x: number, y: number, w: number, h: number, zoom: number, top: boolean): void {
  const scale = Math.max(w / image.width, h / image.height) * zoom;
  const dw = image.width * scale;
  const dh = image.height * scale;
  ctx.drawImage(image, x + (w - dw) / 2, top ? y : y + (h - dh) / 2, dw, dh);
}

export function formatNumber(value: number, decimals: number): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

type CardContext = { ctx: CanvasRenderingContext2D; w: number; h: number; k: number; tall: boolean; field: Field; look: KineticLook; local: number; span: number; seed: number; entrance: Entrance; instant: boolean; pulse: number };

function drawCard(c: CardContext, card: KineticCard): void {
  const { ctx, w, h, k, tall, field, local, span, seed } = c;
  const a = c.instant ? 1 : clamp(local / 0.42);
  const margin = (tall ? 70 : 140) * k;
  const maxW = w - margin * 2;
  if (card.kind === 'words') {
    const { lines, size } = fitBig(ctx, card.text.toUpperCase(), (s) => `${s}px ${HEAVY}`, maxW, h * (card.sub ? 0.5 : 0.62), tall ? 4 : 3, (tall ? 300 : 330) * k, 70 * k);
    const block = lines.length * size * 0.98;
    const cy = card.sub ? h / 2 - 40 * k : h / 2;
    bigLines(ctx, lines, size, w / 2, cy, a, c.entrance, card.accent ? field.pop : field.text, w, k, seed);
    if (card.strike) {
      // Crossed out on the second half of the beat: the old way, struck.
      const s = easeOutExpo((local - span * 0.45) / 0.25);
      if (s > 0) {
        ctx.fillStyle = field.pop;
        const lw = Math.min(maxW, Math.max(...lines.map((line) => { ctx.font = `${size}px ${HEAVY}`; return ctx.measureText(line).width; })) + 40 * k);
        ctx.save();
        ctx.translate(w / 2, cy);
        ctx.rotate(-0.06);
        ctx.fillRect(-lw / 2, -10 * k, lw * s, 20 * k);
        ctx.restore();
      }
    }
    if (card.sub) subLine(ctx, card.sub, w / 2, cy + block / 2 + 90 * k, maxW, k, c.instant ? 1 : (local - 0.25) / 0.4, field.text);
  } else if (card.kind === 'counter') {
    const run = c.instant ? 1 : easeOut((local - 0.05) / Math.min(0.9, span * 0.7));
    // Sized for the final number, so the count never grows out of the frame.
    const final = `${card.prefix}${formatNumber(card.value, card.decimals)}${card.suffix}`;
    const { size } = fitBig(ctx, final, (s) => `${s}px ${HEAVY}`, maxW, h * 0.42, 1, (tall ? 360 : 420) * k, 90 * k);
    ctx.font = `${size}px ${HEAVY}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = field.pop;
    const s = 1 + 0.2 * (1 - easeOutExpo(a));
    ctx.save();
    ctx.translate(w / 2, h / 2 - 20 * k);
    ctx.scale(s, s);
    ctx.fillText(`${card.prefix}${formatNumber(card.value * run, card.decimals)}${card.suffix}`, 0, size * 0.3);
    ctx.restore();
    if (card.label) subLine(ctx, card.label, w / 2, h / 2 + size * 0.45 + 40 * k, maxW, k, c.instant ? 1 : (local - 0.2) / 0.4, field.text);
  } else if (card.kind === 'picture') {
    const z = 1.04 + 0.08 * clamp(local / Math.max(0.5, span));
    ctx.save();
    const inset = (1 - easeOutExpo(a)) * 120 * k;
    ctx.beginPath();
    ctx.rect(inset, inset, w - inset * 2, h - inset * 2);
    ctx.clip();
    coverImage(ctx, card.image, 0, 0, w, h, z, false);
    ctx.restore();
    if (card.label) {
      ctx.font = `${(tall ? 90 : 96) * k}px ${HEAVY}`;
      const lines = wrap(ctx, card.label.toUpperCase(), maxW).slice(0, 2);
      const lh = (tall ? 96 : 102) * k;
      const boxH = lines.length * lh + 50 * k;
      const by = h - boxH - (tall ? 260 : 90) * k;
      ctx.fillStyle = field.fill;
      const bw = Math.max(...lines.map((line) => ctx.measureText(line).width)) + 70 * k;
      ctx.fillRect(margin - 35 * k, by, Math.min(w - margin, bw) * easeOutExpo((local - 0.1) / 0.35), boxH);
      ctx.fillStyle = field.text;
      ctx.textAlign = 'left';
      ctx.globalAlpha *= clamp((local - 0.2) / 0.2);
      lines.forEach((line, i) => ctx.fillText(line, margin, by + 25 * k + (i + 1) * lh - 14 * k));
    }
  } else if (card.kind === 'shot' && (card.zoom ?? 1) > 1) {
    // A punch-in: part of the real page filling the frame, panning slowly, cut in on the beat.
    const img = card.image;
    const scale = (w / img.width) * (card.zoom ?? 1.8) * (1 + 0.06 * clamp(local / Math.max(0.5, span)));
    const dw = img.width * scale;
    const dh = img.height * scale;
    const fy = clamp(card.focus ?? 0) * Math.max(0, dh - h);
    const pan = (1 - easeOut(local / Math.max(0.8, span))) * 60 * k;
    ctx.drawImage(img, (w - dw) / 2 + pan, -fy, dw, dh);
    const vignette = ctx.createLinearGradient(0, h * 0.6, 0, h);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, h * 0.6, w, h * 0.4);
  } else if (card.kind === 'shot') {
    // The real site in a tilted window that swings level and scrolls.
    const fw = tall ? w - 100 * k : w * 0.8;
    const fh = tall ? h * 0.66 : h * 0.8;
    const tilt = (1 - easeOutExpo(a)) * 0.25 + -0.035;
    ctx.save();
    ctx.translate(w / 2, h / 2 + (tall ? 60 : 30) * k + (1 - easeOutExpo(a)) * h * 0.4);
    ctx.rotate(tilt);
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 60 * k;
    ctx.shadowOffsetY = 30 * k;
    roundRect(ctx, -fw / 2, -fh / 2, fw, fh, 28 * k);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.shadowColor = 'transparent';
    const bar = 56 * k;
    ctx.fillStyle = '#ececec';
    roundRect(ctx, -fw / 2, -fh / 2, fw, bar, 28 * k);
    ctx.fill();
    ctx.fillRect(-fw / 2, -fh / 2 + bar / 2, fw, bar / 2);
    ctx.fillStyle = '#555555';
    ctx.font = `600 ${24 * k}px ${SANS}`;
    ctx.textAlign = 'center';
    ctx.fillText(card.host, 0, -fh / 2 + bar / 2 + 8 * k);
    ctx.beginPath();
    ctx.rect(-fw / 2, -fh / 2 + bar, fw, fh - bar);
    ctx.clip();
    const scale = Math.max(fw / card.image.width, (fh - bar) / card.image.height);
    const travel = card.scroll ? Math.max(0, card.image.height * scale - (fh - bar)) * 0.6 : 0;
    const scroll = travel * easeOut((local - 0.5) / Math.max(1, span - 0.8));
    ctx.drawImage(card.image, -fw / 2 + (fw - card.image.width * scale) / 2, -fh / 2 + bar - scroll, card.image.width * scale, card.image.height * scale);
    ctx.restore();
  } else if (card.kind === 'step') {
    // A real sequence, so a real number: huge and outlined, the step written across it.
    const numSize = (tall ? 620 : 640) * k;
    ctx.font = `${numSize}px ${HEAVY}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = field.pop;
    ctx.globalAlpha *= 0.22;
    const s = 1 + 0.25 * (1 - easeOutExpo(a));
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(s, s);
    ctx.fillText(String(card.n), 0, numSize * 0.35);
    ctx.restore();
    ctx.globalAlpha = 1;
    const { lines, size } = fitBig(ctx, card.text.toUpperCase(), (sz) => `${sz}px ${HEAVY}`, maxW, h * 0.32, 2, (tall ? 170 : 180) * k, 60 * k);
    bigLines(ctx, lines, size, w / 2, h / 2, c.instant ? 1 : clamp((local - 0.1) / 0.4), 'rise', field.text, w, k, seed);
    if (card.sub) subLine(ctx, card.sub, w / 2, h / 2 + (lines.length * size) / 2 + 70 * k, maxW, k, (local - 0.3) / 0.4, field.text);
  } else {
    // With no name to show, the closing line itself becomes the big words.
    const name = (card.name || card.host || card.line).toUpperCase();
    const lineBelow = card.name || card.host ? card.line : '';
    let y = h / 2 - (tall ? 200 : 150) * k;
    if (name) {
      const { lines, size } = fitBig(ctx, name, (s) => `${s}px ${HEAVY}`, maxW, h * (lineBelow ? 0.3 : 0.42), lineBelow ? 1 : 3, (tall ? 260 : 300) * k, 70 * k);
      bigLines(ctx, lines, size, w / 2, y, c.instant ? 1 : clamp(local / 0.7), 'scatter', field.text, w, k, seed);
      // Once landed, the button breathes on the beat (below) so a long close never sits dead still.
      y += (lines.length * size * 0.98) / 2 + size * 0.1 + 40 * k;
    }
    if (lineBelow) y = subLine(ctx, lineBelow, w / 2, y + 30 * k, maxW, k, (local - 0.6) / 0.4, field.text) + 20 * k;
    if (card.button) {
      const b = easeOutExpo((local - 1.0) / 0.35);
      ctx.font = `700 ${44 * k}px ${SANS}`;
      const bw = ctx.measureText(card.button).width + 110 * k;
      const bh = 110 * k;
      const grow = (0.7 + 0.3 * b) * (1 + 0.05 * c.pulse * clamp(local - 1.4));
      ctx.save();
      ctx.globalAlpha *= clamp(b * 2);
      ctx.translate(w / 2, y + bh / 2 + 20 * k);
      ctx.scale(grow, grow);
      roundRect(ctx, -bw / 2, -bh / 2, bw, bh, bh / 2);
      ctx.fillStyle = field.pop;
      ctx.fill();
      ctx.fillStyle = onField(field.pop);
      ctx.textAlign = 'center';
      ctx.fillText(card.button, 0, 15 * k);
      ctx.restore();
      y += bh + 40 * k;
    }
    if (card.host && card.name) {
      ctx.globalAlpha *= clamp((local - 1.4) / 0.4);
      ctx.font = `600 ${36 * k}px ${SANS}`;
      ctx.fillStyle = field.text;
      ctx.textAlign = 'center';
      ctx.fillText(card.host, w / 2, y + 50 * k);
    }
  }
}

/**
 * Where each card of a scene starts, in seconds from the scene start. Cards spread over the scene, each holding a whole
 * number of beats (one to three), and every cut lands on the beat grid of the whole video, so cuts hit the music.
 */
export function cardStarts(sceneStart: number, seconds: number, count: number, beat: number): number[] {
  if (count <= 1) return [0];
  // Each card gets at least one beat (two at fast tempos), so a word is on screen long enough to read.
  const step = beat < 0.6 ? beat * 2 : beat;
  const hold = step * Math.max(1, Math.min(3, Math.floor(seconds / (count * step))));
  const snap = (x: number) => Math.round((sceneStart + x) / step) * step - sceneStart;
  const starts = [0];
  for (let i = 1; i < count; i++) {
    let at = snap(i * hold);
    if (at < starts[i - 1] + step * 0.9) at = starts[i - 1] + step;
    if (at > seconds - step * 0.6) break;
    starts.push(at);
  }
  if (starts.length === count) return starts;
  // Not enough beats in this scene: share it evenly instead.
  return Array.from({ length: count }, (_, i) => (seconds * i) / count);
}

/** Draws the Kinetic frame at time t (seconds). beat is the music's beat length in seconds. */
export function drawKineticFrame(ctx: CanvasRenderingContext2D, w: number, h: number, scenes: KineticScene[], t: number, look: KineticLook, brand: KineticBrand, beat = 60 / 112): void {
  if (scenes.length === 0) return;
  const k = Math.min(w, h) / 1080;
  const tall = h > w;
  const { index, local, start } = sceneAt(scenes, t);
  const scene = scenes[index];
  const starts = cardStarts(start, scene.seconds, scene.cards.length, beat);
  let ci = 0;
  while (ci + 1 < starts.length && local >= starts[ci + 1]) ci += 1;
  const card = scene.cards[ci];
  const cardLocal = local - starts[ci];
  const span = (ci + 1 < starts.length ? starts[ci + 1] : scene.seconds) - starts[ci];
  // A running card number across the whole video picks the field, pattern and entrance, so nothing repeats back to back.
  let n = 0;
  for (let i = 0; i < index; i++) n += Math.max(1, scenes[i].cards.length);
  n += ci;
  const field = fieldFor(card && card.kind === 'close' ? 1 : n, look);
  ctx.globalAlpha = 1;
  ctx.fillStyle = field.fill;
  ctx.fillRect(0, 0, w, h);
  if (card && card.kind !== 'picture') pattern(ctx, PATTERNS[(n * 3 + 1) % PATTERNS.length], w, h, k, t, field, look, beat);
  if (card) {
    // The close holds to the end, so it pushes in slowly instead of sitting still.
    const push = card.kind === 'close' ? 1 + 0.06 * clamp((cardLocal - 1.2) / Math.max(1, span - 1.2)) : 1;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(push, push);
    ctx.translate(-w / 2, -h / 2);
    drawCard({ ctx, w, h, k, tall, field, look, local: cardLocal, span, seed: n * 97 + 11, entrance: ENTRANCES[n % ENTRANCES.length], instant: index === 0 && ci === 0, pulse: 1 - easeOut((t % beat) / (beat * 0.6)) }, card);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  // A flash frame on every cut (but not the first frame): the hit the eye feels as a beat.
  if (!(index === 0 && ci === 0) && cardLocal < 0.05) {
    ctx.fillStyle = rgba(field.text, 0.18 * (1 - cardLocal / 0.05));
    ctx.fillRect(0, 0, w, h);
  }
  // The brand small in the corner, and a rail that fills as the video plays.
  if (brand.name && card?.kind !== 'close' && card?.kind !== 'picture') {
    ctx.fillStyle = rgba(field.text === '#ffffff' ? '#ffffff' : '#111111', 0.7);
    ctx.textAlign = 'left';
    ctx.font = `700 ${26 * k}px ${SANS}`;
    setSpacing(ctx, 3 * k);
    ctx.fillText(brand.name.toUpperCase(), 56 * k, (tall ? 120 : 70) * k);
    setSpacing(ctx, 0);
  }
  const total = totalSeconds(scenes);
  ctx.fillStyle = rgba(field.text, 0.2);
  ctx.fillRect(0, h - 8 * k, w, 8 * k);
  ctx.fillStyle = field.pop;
  ctx.fillRect(0, h - 8 * k, w * clamp(t / Math.max(0.1, total)), 8 * k);
}

/** A number in the text worth counting up to ("2,500 searches", "3x faster", "99.9% uptime"), or null. */
export function numberIn(text: string): { value: number; decimals: number; prefix: string; suffix: string; label: string } | null {
  const m = /([$€£]?)(\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?)\s?(%|x|×|k|K|M|\+)?/.exec(text);
  if (!m) return null;
  const raw = m[2].replace(/,/g, '');
  const value = Number(raw);
  // Years and tiny numbers are not stats.
  if (!Number.isFinite(value) || value < 2 || (value >= 1900 && value <= 2100 && !m[3] && !m[1])) return null;
  const decimals = raw.includes('.') ? Math.min(2, raw.split('.')[1].length) : 0;
  const label = (text.slice(0, m.index) + text.slice(m.index + m[0].length)).replace(/\s+/g, ' ').replace(/^[\s,.:–-]+|[\s,.:–-]+$/g, '').trim();
  return { value, decimals, prefix: m[1], suffix: m[3] === '×' ? 'x' : m[3] ?? '', label };
}

/** Splits a heading into slam-sized chunks: one or two words each, short words kept with their neighbour. */
export function chunks(text: string): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let current: string[] = [];
  for (const word of words) {
    current.push(word);
    const letters = current.join(' ').length;
    if (current.length >= 2 || (letters >= 7 && word.length > 3)) {
      out.push(current.join(' '));
      current = [];
    }
  }
  if (current.length) {
    if (out.length && current.join(' ').length <= 3) out[out.length - 1] += ` ${current.join(' ')}`;
    else out.push(current.join(' '));
  }
  return out;
}

type LaunchMediaLike = { name: string; host: string; shot: Img | null; pictures: { image: Img; label: string }[] };

/** The launch story as Kinetic cards: same scenes, same timing, one idea per card. */
export function launchToKinetic(scenes: LaunchScene[], media: LaunchMediaLike): KineticScene[] {
  return scenes.map((scene) => {
    const cards: KineticCard[] = [];
    if (scene.kind === 'hook') {
      const parts = chunks(scene.heading);
      const accent = scene.accent.toLowerCase();
      if (parts.length > 1) for (const part of parts.slice(0, 4)) cards.push({ kind: 'words', text: part, accent: Boolean(accent) && part.toLowerCase().includes(accent) });
      cards.push({ kind: 'words', text: scene.heading, sub: scene.sub });
    } else if (scene.kind === 'problem') {
      cards.push({ kind: 'words', text: scene.heading });
      for (const chip of scene.chips) cards.push({ kind: 'words', text: chip, strike: true });
    } else if (scene.kind === 'tour') {
      cards.push({ kind: 'words', text: scene.heading });
      const image = media.shot ?? media.pictures[0]?.image ?? null;
      if (image) {
        const host = media.host || media.name;
        cards.push({ kind: 'shot', image, host, scroll: Boolean(media.shot) });
        // Punch-ins on the real page: its top, then further down when there is a full-page screenshot to travel.
        cards.push({ kind: 'shot', image, host, scroll: false, zoom: 1.7, focus: 0 });
        if (media.shot) {
          cards.push({ kind: 'shot', image, host, scroll: false, zoom: 1.5, focus: 0.35 });
          cards.push({ kind: 'shot', image, host, scroll: false, zoom: 1.7, focus: 0.65 });
        }
      }
    } else if (scene.kind === 'features' || scene.kind === 'steps') {
      cards.push({ kind: 'words', text: scene.heading });
      scene.items.forEach((item, i) => {
        if (scene.kind === 'steps') return cards.push({ kind: 'step', n: i + 1, text: item.title, sub: item.note });
        const number = numberIn(item.title) ?? numberIn(item.note);
        if (number) cards.push({ kind: 'counter', ...number, label: number.label || item.title });
        else cards.push({ kind: 'words', text: item.title, sub: item.note });
      });
    } else if (scene.kind === 'proof') {
      cards.push({ kind: 'words', text: scene.heading });
      for (const picture of media.pictures.slice(0, 4)) cards.push({ kind: 'picture', image: picture.image, label: picture.label });
    } else {
      cards.push({ kind: 'close', name: media.name, line: scene.heading, button: scene.button, host: media.host });
    }
    return { seconds: scene.seconds, cards };
  });
}

type ShortSceneLike = { kind: 'title' | 'point' | 'end'; heading: string; lines: string[]; seconds: number };

/** A short video's scenes as Kinetic cards. */
export function shortToKinetic(scenes: ShortSceneLike[], brand: KineticBrand): KineticScene[] {
  return scenes.map((scene) => {
    const cards: KineticCard[] = [];
    if (scene.kind === 'title') {
      const parts = chunks(scene.heading);
      if (parts.length > 1) for (const part of parts.slice(0, 4)) cards.push({ kind: 'words', text: part });
      cards.push({ kind: 'words', text: scene.heading, sub: scene.lines[0] });
    } else if (scene.kind === 'point') {
      const number = numberIn(scene.heading);
      cards.push(number ? { kind: 'counter', ...number, label: number.label || scene.heading } : { kind: 'words', text: scene.heading });
      for (const line of scene.lines) cards.push({ kind: 'words', text: line });
    } else {
      cards.push({ kind: 'close', name: brand.name, line: scene.heading, button: scene.lines[0] ?? '', host: brand.host });
    }
    return { seconds: scene.seconds, cards };
  });
}
