'use strict';

// Cover and closing-slide art for the carousel tool, drawn in code so it costs nothing, never fails,
// and never contains garbled lettering. Three looks match the app themes: forge (anvil and sparks),
// crystal (cold shards) and mono (grey rings). `variant` shifts the composition so a cover and its
// closing slide are related but not identical; `seed` makes every carousel's art a little different.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BrandForgeCarouselArt = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  function rng(seed) {
    let s = (Math.floor(Math.abs(seed)) % 2147483646) + 1;
    return () => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }

  function hashSeed(text) {
    let h = 7;
    for (let i = 0; i < String(text || '').length; i++) h = (h * 31 + String(text).charCodeAt(i)) % 1000003;
    return h + 1;
  }

  function makeCanvas(w, h) {
    if (typeof document !== 'undefined') {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      return c;
    }
    throw new Error('A canvas is needed to draw art');
  }

  function panels(ctx, w, h, rand, colors) {
    ctx.save();
    for (let i = 0; i < 7; i++) {
      const pw = 200 + rand() * 220;
      const ph = 90 + rand() * 120;
      const px = rand() * (w - pw);
      const py = 80 + rand() * h * 0.38;
      ctx.globalAlpha = 0.1 + rand() * 0.12;
      ctx.strokeStyle = colors[i % colors.length];
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(px, py, pw, ph, 18);
      else ctx.rect(px, py, pw, ph);
      ctx.stroke();
      ctx.fillStyle = ctx.strokeStyle;
      for (let l = 0; l < 3; l++) ctx.fillRect(px + 18, py + 22 + l * 24, (pw - 36) * (0.4 + rand() * 0.55), 6);
    }
    ctx.restore();
  }

  function vignette(ctx, w, h) {
    const vig = ctx.createRadialGradient(w / 2, h / 2, w * 0.35, w / 2, h / 2, w * 0.95);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);
  }

  function forge(ctx, w, h, variant, rand) {
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#05070d');
    sky.addColorStop(0.6, '#0b0705');
    sky.addColorStop(1, '#000');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    const cool = ctx.createRadialGradient(w * 0.85, h * 0.1, 0, w * 0.85, h * 0.1, w * 0.7);
    cool.addColorStop(0, 'rgba(90,170,255,0.22)');
    cool.addColorStop(1, 'rgba(90,170,255,0)');
    ctx.fillStyle = cool;
    ctx.fillRect(0, 0, w, h);

    const cx = w * 0.5;
    const hit = { x: cx, y: h * (variant === 'cta' ? 0.62 : 0.58) };
    const fire = ctx.createRadialGradient(hit.x, hit.y, 0, hit.x, hit.y, w * 0.95);
    fire.addColorStop(0, 'rgba(255,190,90,0.95)');
    fire.addColorStop(0.12, 'rgba(255,120,40,0.7)');
    fire.addColorStop(0.4, 'rgba(190,60,10,0.32)');
    fire.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = fire;
    ctx.fillRect(0, 0, w, h);
    panels(ctx, w, h, rand, ['#7fc4ff', '#ff8a4d']);

    ctx.fillStyle = '#050403';
    ctx.beginPath();
    const ay = hit.y + 40;
    ctx.moveTo(cx - 330, ay - 30);
    ctx.lineTo(cx + 190, ay - 30);
    ctx.quadraticCurveTo(cx + 330, ay - 20, cx + 380, ay + 40);
    ctx.lineTo(cx + 190, ay + 70);
    ctx.lineTo(cx + 150, ay + 210);
    ctx.lineTo(cx + 250, ay + 330);
    ctx.lineTo(cx - 250, ay + 330);
    ctx.lineTo(cx - 150, ay + 210);
    ctx.lineTo(cx - 190, ay + 70);
    ctx.lineTo(cx - 330, ay + 30);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,170,90,0.9)';
    ctx.lineWidth = 5;
    ctx.shadowColor = 'rgba(255,140,50,0.9)';
    ctx.shadowBlur = 24;
    ctx.beginPath();
    ctx.moveTo(cx - 330, ay - 30);
    ctx.lineTo(cx + 190, ay - 30);
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.save();
    ctx.translate(hit.x + 120, hit.y - 230);
    ctx.rotate(-0.55);
    ctx.fillStyle = '#060504';
    ctx.fillRect(-24, -20, 48, 700);
    ctx.fillRect(-170, -150, 340, 150);
    ctx.strokeStyle = 'rgba(255,170,90,0.55)';
    ctx.lineWidth = 4;
    ctx.shadowColor = 'rgba(255,140,50,0.8)';
    ctx.shadowBlur = 18;
    ctx.strokeRect(-170, -150, 340, 150);
    ctx.restore();

    const flash = ctx.createRadialGradient(hit.x, hit.y, 0, hit.x, hit.y, 220);
    flash.addColorStop(0, 'rgba(255,255,230,1)');
    flash.addColorStop(0.25, 'rgba(255,200,110,0.85)');
    flash.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = flash;
    ctx.fillRect(hit.x - 240, hit.y - 240, 480, 480);

    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 260; i++) {
      const angle = -Math.PI * (0.05 + rand() * 0.9);
      const dist = 40 + Math.pow(rand(), 1.6) * w * 0.75;
      const sx = hit.x + Math.cos(angle) * dist + (rand() - 0.5) * 30;
      const sy = hit.y + Math.sin(angle) * dist * 0.9 + dist * 0.25 * rand();
      const len = 6 + rand() * 38;
      ctx.strokeStyle = `rgba(255,${150 + Math.floor(rand() * 90)},${40 + Math.floor(rand() * 60)},${0.35 + rand() * 0.65})`;
      ctx.lineWidth = 1.5 + rand() * 3;
      ctx.shadowColor = 'rgba(255,140,40,0.9)';
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx - Math.cos(angle) * len, sy - Math.sin(angle) * len + len * 0.4);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.shadowBlur = 0;
    vignette(ctx, w, h);
  }

  function crystal(ctx, w, h, variant, rand) {
    ctx.fillStyle = '#02060c';
    ctx.fillRect(0, 0, w, h);
    const cy = h * (variant === 'cta' ? 0.6 : 0.55);
    const glow = ctx.createRadialGradient(w / 2, cy, 0, w / 2, cy, w * 0.9);
    glow.addColorStop(0, 'rgba(150,215,255,0.85)');
    glow.addColorStop(0.2, 'rgba(60,150,230,0.5)');
    glow.addColorStop(0.55, 'rgba(15,60,120,0.3)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
    panels(ctx, w, h, rand, ['#7fc4ff', '#bfe3ff']);
    // faceted shards radiating from the centre
    for (let i = 0; i < 26; i++) {
      const angle = (i / 26) * Math.PI * 2 + rand() * 0.2;
      const len = 180 + rand() * w * 0.5;
      const spread = 0.06 + rand() * 0.08;
      const x1 = w / 2 + Math.cos(angle - spread) * len;
      const y1 = cy + Math.sin(angle - spread) * len;
      const x2 = w / 2 + Math.cos(angle + spread) * len;
      const y2 = cy + Math.sin(angle + spread) * len;
      const tip = { x: w / 2 + Math.cos(angle) * len * 1.25, y: cy + Math.sin(angle) * len * 1.25 };
      const g = ctx.createLinearGradient(w / 2, cy, tip.x, tip.y);
      g.addColorStop(0, `rgba(190,230,255,${0.5 + rand() * 0.3})`);
      g.addColorStop(1, 'rgba(40,110,200,0.05)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(w / 2, cy);
      ctx.lineTo(x1, y1);
      ctx.lineTo(tip.x, tip.y);
      ctx.lineTo(x2, y2);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(210,240,255,0.35)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 160; i++) {
      ctx.fillStyle = `rgba(190,230,255,${0.2 + rand() * 0.7})`;
      ctx.beginPath();
      ctx.arc(rand() * w, rand() * h, 1 + rand() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    vignette(ctx, w, h);
  }

  function mono(ctx, w, h, variant, rand) {
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, w, h);
    const cy = h * (variant === 'cta' ? 0.6 : 0.52);
    const glow = ctx.createRadialGradient(w / 2, cy, 0, w / 2, cy, w * 0.8);
    glow.addColorStop(0, 'rgba(255,255,255,0.35)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
    for (let r = 60; r < w * 1.1; r += 56 + rand() * 26) {
      ctx.strokeStyle = `rgba(255,255,255,${0.05 + rand() * 0.2})`;
      ctx.lineWidth = 1 + rand() * 2.5;
      ctx.beginPath();
      ctx.arc(w / 2, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 140; i++) {
      const a = rand() * Math.PI * 2;
      const d = 80 + rand() * w * 0.7;
      ctx.fillStyle = `rgba(255,255,255,${0.15 + rand() * 0.6})`;
      ctx.beginPath();
      ctx.arc(w / 2 + Math.cos(a) * d, cy + Math.sin(a) * d, 1 + rand() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    panels(ctx, w, h, rand, ['#ffffff', '#bbbbbb']);
    vignette(ctx, w, h);
  }

  /** @returns {HTMLCanvasElement} a w x h canvas with the art drawn */
  function drawArt(w, h, options) {
    const o = options || {};
    const canvas = makeCanvas(w, h);
    const ctx = canvas.getContext('2d');
    const rand = rng(hashSeed(o.seed) + (o.variant === 'cta' ? 11 : 3));
    const theme = o.theme === 'crystal' || o.theme === 'mono' ? o.theme : 'forge';
    (theme === 'crystal' ? crystal : theme === 'mono' ? mono : forge)(ctx, w, h, o.variant === 'cta' ? 'cta' : 'cover', rand);
    return canvas;
  }

  return { drawArt, hashSeed };
});
