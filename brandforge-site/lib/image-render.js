'use strict';

// Draws the single-image posts (ad, quote, tip, announcement, poll) with plain Canvas 2D, in any of the four
// sizes. Same approach as the carousel: the words are drawn by us, never by an image model, so they are always
// spelled right; the browser and the server run this same file.
const R = require('./carousel-render');
const { FORMATS } = require('./image-kinds');

const { HEAD, BODY, cleanText, parseAccent, wrapWords, drawLine, fitHeadline, coverFit, themeFor, brandMark, inkOn } = R;

/** { w, h } for a format id. */
function sizeOf(format) {
  const f = FORMATS[format] || FORMATS.square;
  return { w: f.w, h: f.h };
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

function shade(ctx, theme, w, y0, y1, from, to) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, `rgba(${theme.bgRgb},${from})`);
  g.addColorStop(1, `rgba(${theme.bgRgb},${to})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, Math.min(y0, y1), w, Math.abs(y1 - y0));
}

// Plain text wrapped to a width -> array of strings.
function wrapPlain(ctx, text, maxWidth) {
  const words = cleanText(text, 400).split(' ').filter(Boolean).map((t) => ({ text: t, accent: false }));
  return wrapWords(ctx, words, maxWidth).map((line) => line.map((w) => w.text).join(' '));
}

// A small pill label (the kicker) at x, baseline y. Returns its height.
function pill(ctx, theme, label, x, y, k) {
  const text = cleanText(label, 20).toUpperCase();
  if (!text) return 0;
  ctx.font = `700 ${Math.round(28 * k)}px ${BODY}`;
  const pad = 22 * k;
  const w = ctx.measureText(text).width + pad * 2;
  const h = 54 * k;
  ctx.fillStyle = theme.accent;
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = inkOn(theme.accent);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, x + pad, y + h * 0.68);
  return h;
}

// The button: an accent pill. Returns its height. align 'left' puts it at x, 'center' centres it on x.
function button(ctx, theme, label, x, y, k, align, maxW) {
  const text = cleanText(label, 30);
  if (!text) return 0;
  ctx.font = `700 ${Math.round(44 * k)}px ${BODY}`;
  const w = Math.min(maxW, ctx.measureText(text).width + 100 * k);
  const h = 104 * k;
  const left = align === 'center' ? x - w / 2 : x;
  ctx.fillStyle = theme.accent;
  roundRect(ctx, left, y, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = inkOn(theme.accent);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(text, left + w / 2, y + h * 0.66);
  ctx.textAlign = 'left';
  return h;
}

function handleLine(ctx, theme, options, w, h, m, k) {
  const handle = cleanText(options && options.brand && options.brand.handle, 40);
  if (!handle) return;
  ctx.font = `600 ${Math.round(26 * k)}px ${BODY}`;
  ctx.fillStyle = theme.muted;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(handle, w - m, h - m * 0.55);
  ctx.textAlign = 'left';
}

function headlineBlock(ctx, copy, maxW, maxLines, start, min) {
  return fitHeadline(ctx, cleanText(copy.headline, 160), maxW, maxLines, start, min);
}

// Draws a fitted headline with its top edge at `top`; returns the bottom edge of the block.
function drawBlock(ctx, fitted, theme, x, top, lineH, align) {
  ctx.textAlign = 'left';
  ctx.font = `${fitted.size}px ${HEAD}`;
  let y = top + lineH - fitted.size * 0.16;
  for (const line of fitted.lines) {
    drawLine(ctx, line, x, y, theme, align);
    y += lineH;
  }
  return top + fitted.lines.length * lineH;
}

// ---- Ad: full-bleed picture, words stacked from the bottom, button last. ----
function drawAd(ctx, spec, options, art, w, h, k, m) {
  const theme = themeFor(options);
  const copy = spec.copy;
  const wide = w > h;
  coverFit(ctx, art, 0, 0, w, h, false);
  shade(ctx, theme, w, 0, h * 0.22, 0.6, 0);
  shade(ctx, theme, w, h * (wide ? 0.1 : 0.28), h * 0.8, 0, 0.94);
  ctx.fillStyle = `rgba(${theme.bgRgb},0.94)`;
  ctx.fillRect(0, h * 0.8, w, h * 0.2 + 1);

  brandMark(ctx, theme, options, m, m + 40 * k, 54 * k, 'left');

  const maxW = wide ? w * 0.62 : w - m * 2;
  let bottom = h - m;
  if (copy.button) bottom -= button(ctx, theme, copy.button, m, bottom - 104 * k, k, 'left', maxW) + 36 * k;
  ctx.font = `600 ${Math.round(40 * k)}px ${BODY}`;
  const subLines = copy.sub ? wrapPlain(ctx, copy.sub, maxW).slice(0, wide ? 2 : 3) : [];
  const subH = subLines.length * 54 * k;
  if (subLines.length) {
    ctx.fillStyle = theme.text;
    subLines.forEach((line, i) => ctx.fillText(line, m, bottom - subH + 40 * k + i * 54 * k));
    bottom -= subH + 28 * k;
  }
  const fitted = headlineBlock(ctx, copy, maxW, wide ? 3 : 5, Math.round(132 * k), Math.round(54 * k));
  const lineH = Math.round(fitted.size * 1.04);
  ctx.font = `${fitted.size}px ${HEAD}`;
  const top = bottom - fitted.lines.length * lineH;
  drawBlock(ctx, fitted, theme, m, top, lineH, 'left');
  if (copy.kicker) pill(ctx, theme, copy.kicker, m, top - 54 * k - 26 * k, k);
  handleLine(ctx, theme, options, w, h, m, k);
}

// ---- Announcement: the picture on top, a solid panel with the news below. ----
function drawAnnouncement(ctx, spec, options, art, w, h, k, m) {
  const theme = themeFor(options);
  const copy = spec.copy;
  const wide = w > h;
  coverFit(ctx, art, 0, 0, w, h, false);
  ctx.fillStyle = `rgba(${theme.bgRgb},${theme.light ? 0.5 : 0.62})`;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = theme.accent;
  ctx.lineWidth = 6 * k;
  ctx.strokeRect(m * 0.5, m * 0.5, w - m, h - m);

  brandMark(ctx, theme, options, w / 2, m + 52 * k, 58 * k, 'center');

  const maxW = w - m * 2.4;
  const fitted = headlineBlock(ctx, copy, maxW, wide ? 3 : 5, Math.round(140 * k), Math.round(56 * k));
  const lineH = Math.round(fitted.size * 1.05);
  ctx.font = `600 ${Math.round(42 * k)}px ${BODY}`;
  const subLines = copy.sub ? wrapPlain(ctx, copy.sub, maxW).slice(0, wide ? 2 : 4) : [];
  const kickerH = copy.kicker ? 54 * k + 30 * k : 0;
  const btnH = copy.button ? 104 * k + 40 * k : 0;
  const total = kickerH + fitted.lines.length * lineH + (subLines.length ? 30 * k + subLines.length * 56 * k : 0) + btnH;
  let y = Math.max(m + 110 * k, (h - total) / 2 + 40 * k);
  if (copy.kicker) {
    ctx.font = `700 ${Math.round(28 * k)}px ${BODY}`;
    const kw = ctx.measureText(cleanText(copy.kicker, 20).toUpperCase()).width + 44 * k;
    pill(ctx, theme, copy.kicker, (w - kw) / 2, y, k);
    y += kickerH;
  }
  ctx.font = `${fitted.size}px ${HEAD}`;
  y = drawBlock(ctx, fitted, theme, w / 2, y, lineH, 'center');
  if (subLines.length) {
    y += 26 * k;
    ctx.font = `600 ${Math.round(42 * k)}px ${BODY}`;
    ctx.fillStyle = theme.text;
    ctx.textAlign = 'center';
    subLines.forEach((line, i) => ctx.fillText(line, w / 2, y + 36 * k + i * 56 * k));
    ctx.textAlign = 'left';
    y += subLines.length * 56 * k;
  }
  if (copy.button) button(ctx, theme, copy.button, w / 2, y + 26 * k, k, 'center', w - m * 2);
  handleLine(ctx, theme, options, w, h, m, k);
}

// ---- Quote: the line, big, in the middle; a quiet picture behind it. ----
function drawQuote(ctx, spec, options, art, w, h, k, m) {
  const theme = themeFor(options);
  const copy = spec.copy;
  coverFit(ctx, art, 0, 0, w, h, false);
  ctx.fillStyle = `rgba(${theme.bgRgb},${theme.light ? 0.8 : 0.82})`;
  ctx.fillRect(0, 0, w, h);

  const maxW = w - m * 2.2;
  const fitted = headlineBlock(ctx, copy, maxW, h > w ? 8 : 5, Math.round(112 * k), Math.round(44 * k));
  const lineH = Math.round(fitted.size * 1.12);
  const mark = Math.round(220 * k);
  const attribution = cleanText(copy.attribution || (options && options.brand && options.brand.name) || '', 40);
  const blockH = mark * 0.62 + fitted.lines.length * lineH + (attribution ? 104 * k : 0);
  let y = Math.max(m + 30 * k, (h - blockH) / 2);

  ctx.font = `${mark}px ${HEAD}`;
  ctx.fillStyle = theme.accent;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('“', w / 2, y + mark * 0.78);
  y += mark * 0.62;
  ctx.font = `${fitted.size}px ${HEAD}`;
  y = drawBlock(ctx, fitted, theme, w / 2, y, lineH, 'center');
  if (attribution) {
    ctx.fillStyle = theme.accent;
    ctx.fillRect(w / 2 - 36 * k, y + 24 * k, 72 * k, 5 * k);
    ctx.font = `700 ${Math.round(34 * k)}px ${BODY}`;
    ctx.fillStyle = theme.text;
    ctx.textAlign = 'center';
    ctx.fillText(attribution.toUpperCase(), w / 2, y + 84 * k);
  }
  ctx.textAlign = 'left';
  handleLine(ctx, theme, options, w, h, m, k);
}

// ---- Tip: label, instruction, reason. Left-aligned like a note someone wrote to you. ----
function drawTip(ctx, spec, options, art, w, h, k, m) {
  const theme = themeFor(options);
  const copy = spec.copy;
  const wide = w > h;
  coverFit(ctx, art, 0, 0, w, h, false);
  ctx.fillStyle = `rgba(${theme.bgRgb},${theme.light ? 0.86 : 0.88})`;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = theme.accent;
  ctx.fillRect(0, 0, 18 * k, h);

  brandMark(ctx, theme, options, m + 14 * k, m + 40 * k, 50 * k, 'left');

  const maxW = w - m * 2 - 14 * k;
  const fitted = headlineBlock(ctx, copy, maxW, wide ? 3 : 5, Math.round(124 * k), Math.round(52 * k));
  const lineH = Math.round(fitted.size * 1.05);
  ctx.font = `600 ${Math.round(44 * k)}px ${BODY}`;
  const subLines = copy.sub ? wrapPlain(ctx, copy.sub, maxW).slice(0, wide ? 3 : 6) : [];
  const total = 54 * k + 34 * k + fitted.lines.length * lineH + (subLines.length ? 34 * k + subLines.length * 62 * k : 0);
  let y = Math.max(m + 120 * k, (h - total) / 2 + 20 * k);
  pill(ctx, theme, copy.kicker || 'Quick tip', m + 14 * k, y, k);
  y += 54 * k + 34 * k;
  ctx.font = `${fitted.size}px ${HEAD}`;
  y = drawBlock(ctx, fitted, theme, m + 14 * k, y, lineH, 'left');
  if (subLines.length) {
    y += 34 * k;
    ctx.font = `600 ${Math.round(44 * k)}px ${BODY}`;
    ctx.fillStyle = theme.text;
    subLines.forEach((line, i) => ctx.fillText(line, m + 14 * k, y + 40 * k + i * 62 * k));
  }
  handleLine(ctx, theme, options, w, h, m, k);
}

// ---- Poll: the question and lettered answers. ----
function drawQuestion(ctx, spec, options, art, w, h, k, m) {
  const theme = themeFor(options);
  const copy = spec.copy;
  const wide = w > h;
  coverFit(ctx, art, 0, 0, w, h, false);
  ctx.fillStyle = `rgba(${theme.bgRgb},${theme.light ? 0.82 : 0.86})`;
  ctx.fillRect(0, 0, w, h);

  brandMark(ctx, theme, options, m, m + 40 * k, 50 * k, 'left');

  const answers = (copy.options || []).slice(0, 4);
  const cols = wide ? 2 : 1;
  const rows = Math.ceil(answers.length / cols);
  const gap = 22 * k;
  const footer = 60 * k;
  const maxW = w - m * 2;
  const top = m + 100 * k;
  const room = h - m * 0.8 - top;

  // The question gets the biggest type that still leaves room for every answer; the rows shrink a little first.
  let rowH = (wide ? 84 : 118) * k;
  let fitted = headlineBlock(ctx, copy, maxW, wide ? 2 : 4, Math.round(116 * k), Math.round(48 * k));
  let lineH = Math.round(fitted.size * 1.05);
  const needed = () => (copy.kicker ? 54 * k + 28 * k : 0) + fitted.lines.length * lineH + 44 * k + rows * rowH + (rows - 1) * gap + footer;
  for (const start of [100, 84, 70, 58]) {
    if (needed() <= room) break;
    rowH = Math.max((wide ? 66 : 84) * k, rowH - 14 * k);
    if (needed() <= room) break;
    fitted = headlineBlock(ctx, copy, maxW, wide ? 2 : 3, Math.round(start * k), Math.round(40 * k));
    lineH = Math.round(fitted.size * 1.05);
  }
  const listH = rows * rowH + (rows - 1) * gap;
  let y = Math.max(top, (h - needed()) / 2 + 30 * k);
  if (copy.kicker) {
    pill(ctx, theme, copy.kicker, m, y, k);
    y += 54 * k + 28 * k;
  }
  ctx.font = `${fitted.size}px ${HEAD}`;
  y = drawBlock(ctx, fitted, theme, m, y, lineH, 'left');
  y += 44 * k;

  const colW = (maxW - (cols - 1) * gap) / cols;
  answers.forEach((answer, i) => {
    const cx = m + (i % cols) * (colW + gap);
    const cy = y + Math.floor(i / cols) * (rowH + gap);
    ctx.fillStyle = theme.light ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.07)';
    roundRect(ctx, cx, cy, colW, rowH, rowH / 2);
    ctx.fill();
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 3 * k;
    ctx.stroke();
    const r = rowH * 0.34;
    ctx.fillStyle = theme.accent;
    ctx.beginPath();
    ctx.arc(cx + rowH / 2, cy + rowH / 2, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = inkOn(theme.accent);
    ctx.font = `700 ${Math.round(rowH * 0.34)}px ${BODY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(String.fromCharCode(65 + i), cx + rowH / 2, cy + rowH / 2 + rowH * 0.12);
    ctx.textAlign = 'left';
    ctx.fillStyle = theme.text;
    ctx.font = `600 ${Math.round(rowH * 0.36)}px ${BODY}`;
    let label = cleanText(answer, 40);
    while (label.length > 3 && ctx.measureText(label).width > colW - rowH * 1.3) label = label.slice(0, -2);
    ctx.fillText(label, cx + rowH * 1.05, cy + rowH / 2 + rowH * 0.13);
  });
  ctx.font = `600 ${Math.round(30 * k)}px ${BODY}`;
  ctx.fillStyle = theme.muted;
  ctx.fillText('Vote in the comments', m, y + listH + 52 * k);
  handleLine(ctx, theme, options, w, h, m, k);
}

const DRAWERS = { ad: drawAd, announcement: drawAnnouncement, quote: drawQuote, tip: drawTip, question: drawQuestion };

/**
 * Draws one image onto a context that is already sized to sizeOf(spec.format).
 * spec = { kind, format, copy }, options = { theme, brand }, art = a picture or drawn art to sit behind.
 */
function drawImagePost(ctx, spec, options, art) {
  const { w, h } = sizeOf(spec.format);
  const k = Math.min(1, h / 1080);
  const m = Math.round(Math.min(w, h) * 0.075);
  const theme = themeFor(options);
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, w, h);
  (DRAWERS[spec.kind] || drawAd)(ctx, spec, options, art, w, h, k, m);
}

module.exports = { sizeOf, drawImagePost, parseAccent };
