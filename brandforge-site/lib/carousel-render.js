'use strict';

// Draws the "numbered list" carousel: a hook cover, one slide per item (a screenshot on top, a
// big numbered title and three bullets under it) and a closing call to action. Everything is plain
// Canvas 2D so the same code runs in the browser (the product) and in headless Chromium (our own
// ads), and the text is drawn by us rather than by an image model, so it is always spelled right.
//
// Slide size is 1080 x 1350 (4:5), the largest feed ratio Instagram and TikTok photo posts show.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BrandForgeCarousel = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const W = 1080;
  const H = 1350;
  const HEAD = "'BFAnton', 'Anton', Impact, 'Arial Narrow', sans-serif";
  const BODY = "'BFInter', Inter, 'Segoe UI', Arial, sans-serif";

  const THEMES = {
    forge: { bg: '#000000', text: '#ffffff', accent: '#ff6a2b', muted: '#9b958c' },
    crystal: { bg: '#000000', text: '#ffffff', accent: '#7fc4ff', muted: '#8d99a6' },
    mono: { bg: '#000000', text: '#ffffff', accent: '#e8e8e8', muted: '#8f8f8f' },
  };

  function cleanText(value, max) {
    return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max);
  }

  // "THESE TOOLS ARE *SHAKING* THE WORLD" -> [{text, accent}] per word. Words between asterisks
  // get the accent colour.
  function parseAccent(value) {
    const out = [];
    let accent = false;
    for (const part of String(value || '').split('*')) {
      for (const word of part.split(/\s+/).filter(Boolean)) out.push({ text: word, accent });
      accent = !accent;
    }
    return out;
  }

  // Greedy wrap of coloured words into lines no wider than maxWidth.
  function wrapWords(ctx, words, maxWidth) {
    const lines = [];
    let line = [];
    let width = 0;
    const space = ctx.measureText(' ').width;
    for (const word of words) {
      const w = ctx.measureText(word.text).width;
      const next = line.length ? width + space + w : w;
      if (line.length && next > maxWidth) {
        lines.push(line);
        line = [word];
        width = w;
      } else {
        line.push(word);
        width = next;
      }
    }
    if (line.length) lines.push(line);
    return lines;
  }

  function drawLine(ctx, line, centerX, y, theme, align) {
    const space = ctx.measureText(' ').width;
    const total = line.reduce((sum, word, i) => sum + ctx.measureText(word.text).width + (i ? space : 0), 0);
    let x = align === 'center' ? centerX - total / 2 : centerX;
    ctx.textBaseline = 'alphabetic';
    for (const word of line) {
      ctx.fillStyle = word.accent ? theme.accent : theme.text;
      ctx.fillText(word.text, x, y);
      x += ctx.measureText(word.text).width + space;
    }
  }

  // Fit a headline into a box by shrinking the font until it wraps into at most maxLines lines.
  function fitHeadline(ctx, text, maxWidth, maxLines, startSize, minSize) {
    const words = parseAccent(String(text).toUpperCase());
    for (let size = startSize; size >= minSize; size -= 4) {
      ctx.font = `${size}px ${HEAD}`;
      const lines = wrapWords(ctx, words, maxWidth);
      if (lines.length <= maxLines) return { size, lines };
    }
    ctx.font = `${minSize}px ${HEAD}`;
    return { size: minSize, lines: wrapWords(ctx, words, maxWidth).slice(0, maxLines) };
  }

  // crop = {x, y, w, h} in source pixels: draw only that part of the picture (a screenshot's
  // useful area), scaled to cover the box.
  function coverFit(ctx, img, x, y, w, h, alignTop, crop) {
    if (!img) return;
    const iw = img.width || img.naturalWidth;
    const ih = img.height || img.naturalHeight;
    if (!iw || !ih) return;
    const sx = crop ? Math.max(0, Math.min(crop.x, iw - 1)) : 0;
    const sy = crop ? Math.max(0, Math.min(crop.y, ih - 1)) : 0;
    const sw = crop ? Math.min(crop.w, iw - sx) : iw;
    const sh = crop ? Math.min(crop.h, ih - sy) : ih;
    const scale = Math.max(w / sw, h / sh);
    const dw = sw * scale;
    const dh = sh * scale;
    const dx = x + (w - dw) / 2;
    const dy = alignTop ? y : y + (h - dh) / 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
    ctx.restore();
  }

  function fade(ctx, y0, y1, color, from, to) {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, color.replace('{a}', String(from)));
    g.addColorStop(1, color.replace('{a}', String(to)));
    ctx.fillStyle = g;
    ctx.fillRect(0, Math.min(y0, y1), W, Math.abs(y1 - y0));
  }

  function wordmark(ctx, theme, x, y, size, align) {
    ctx.font = `${size}px ${HEAD}`;
    const a = 'BRAND';
    const b = 'FORGE';
    const wa = ctx.measureText(a).width;
    const wb = ctx.measureText(b).width;
    const start = align === 'center' ? x - (wa + wb) / 2 : x;
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = theme.text;
    ctx.fillText(a, start, y);
    ctx.fillStyle = theme.accent;
    ctx.fillText(b, start + wa, y);
  }

  function base(ctx, theme) {
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, W, H);
  }

  /** Slide 1: the hook over full-bleed art. cover = { headline, kicker?, art } */
  function drawCover(ctx, cover, options) {
    const theme = THEMES[(options && options.theme) || 'forge'];
    base(ctx, theme);
    coverFit(ctx, cover.art, 0, 0, W, H, false);
    fade(ctx, 380, 900, 'rgba(0,0,0,{a})', 0, 0.92);
    ctx.fillStyle = 'rgba(0,0,0,0.92)';
    ctx.fillRect(0, 900, W, H - 900);
    fade(ctx, 0, 220, 'rgba(0,0,0,{a})', 0.55, 0);

    wordmark(ctx, theme, 60, 92, 54, 'left');

    const fitted = fitHeadline(ctx, cleanText(cover.headline, 160), W - 140, 4, 128, 64);
    const lineHeight = Math.round(fitted.size * 1.04);
    let y = 1180 - (fitted.lines.length - 1) * lineHeight;
    ctx.font = `${fitted.size}px ${HEAD}`;
    for (const line of fitted.lines) {
      drawLine(ctx, line, W / 2, y, theme, 'center');
      y += lineHeight;
    }
    ctx.textAlign = 'center';
    if (cover.subtitle) {
      ctx.font = `600 38px ${BODY}`;
      ctx.fillStyle = theme.accent;
      ctx.fillText(cleanText(cover.subtitle, 60).toUpperCase(), W / 2, y - lineHeight + 66);
    }
    ctx.font = `600 30px ${BODY}`;
    ctx.fillStyle = theme.text;
    ctx.fillText(cleanText(cover.kicker || 'SWIPE FOR MORE', 40).toUpperCase() + '  ↻', W / 2, 1318);
    ctx.textAlign = 'left';
  }

  /** An item slide. item = { n, name, tag?, bullets[], shot } */
  function drawItem(ctx, item, options) {
    const theme = THEMES[(options && options.theme) || 'forge'];
    base(ctx, theme);
    const shotH = 700;
    coverFit(ctx, item.shot, 0, 0, W, shotH, true, item.crop);
    if (!item.shot) {
      const g = ctx.createLinearGradient(0, 0, W, shotH);
      g.addColorStop(0, '#1a0f08');
      g.addColorStop(1, '#000');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, shotH);
    }
    fade(ctx, shotH - 280, shotH, 'rgba(0,0,0,{a})', 0, 1);

    ctx.textBaseline = 'alphabetic';
    const title = `${item.n}. ${cleanText(item.name, 40).toUpperCase()}`;
    let size = 112;
    ctx.font = `${size}px ${HEAD}`;
    const tag = cleanText(item.tag, 24).toUpperCase();
    while (size > 60 && ctx.measureText(title + (tag ? ' ' + tag : '')).width > W - 120) {
      size -= 4;
      ctx.font = `${size}px ${HEAD}`;
    }
    ctx.fillStyle = theme.accent;
    ctx.fillText(title, 60, 800);
    if (tag) {
      const tw = ctx.measureText(title + ' ').width;
      ctx.fillStyle = theme.text;
      ctx.fillText(tag, 60 + tw, 800);
    }

    ctx.font = `600 46px ${BODY}`;
    ctx.fillStyle = theme.text;
    const maxWidth = W - 60 - 60 - 56;
    let y = 890;
    for (const raw of (item.bullets || []).slice(0, 3)) {
      const words = cleanText(raw, 140).split(' ').map((text) => ({ text, accent: false }));
      const lines = wrapWords(ctx, words, maxWidth);
      ctx.fillStyle = theme.accent;
      ctx.beginPath();
      ctx.arc(76, y - 16, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = theme.text;
      lines.forEach((line, i) => {
        ctx.fillText(line.map((w) => w.text).join(' '), 116, y + i * 58);
      });
      y += lines.length * 58 + 26;
    }

    ctx.font = `600 26px ${BODY}`;
    ctx.fillStyle = theme.muted;
    ctx.textAlign = 'right';
    ctx.fillText(cleanText((options && options.handle) || 'brandforge.gg', 40), W - 60, H - 44);
    ctx.textAlign = 'left';
  }

  /** The last slide: a call to action over art. cta = { headline, button, note?, art } */
  function drawCta(ctx, cta, options) {
    const theme = THEMES[(options && options.theme) || 'forge'];
    base(ctx, theme);
    coverFit(ctx, cta.art, 0, 0, W, H, false);
    ctx.fillStyle = 'rgba(0,0,0,0.58)';
    ctx.fillRect(0, 0, W, H);
    fade(ctx, 700, H, 'rgba(0,0,0,{a})', 0, 0.9);

    wordmark(ctx, theme, W / 2, 190, 84, 'center');
    const fitted = fitHeadline(ctx, cleanText(cta.headline, 120), W - 160, 4, 120, 64);
    const lineHeight = Math.round(fitted.size * 1.06);
    ctx.font = `${fitted.size}px ${HEAD}`;
    let y = 520;
    for (const line of fitted.lines) {
      drawLine(ctx, line, W / 2, y, theme, 'center');
      y += lineHeight;
    }

    const label = cleanText(cta.button, 40);
    ctx.font = `700 44px ${BODY}`;
    const bw = Math.min(W - 120, ctx.measureText(label).width + 110);
    const bx = (W - bw) / 2;
    const by = y + 50;
    ctx.fillStyle = theme.accent;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(bx, by, bw, 112, 56) : ctx.rect(bx, by, bw, 112);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.textAlign = 'center';
    ctx.fillText(label, W / 2, by + 72);
    if (cta.note) {
      ctx.font = `600 32px ${BODY}`;
      ctx.fillStyle = theme.text;
      ctx.fillText(cleanText(cta.note, 80), W / 2, by + 190);
    }
    ctx.textAlign = 'left';
  }

  return { W, H, THEMES, parseAccent, cleanText, drawCover, drawItem, drawCta };
});
