'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type VideoImage = { url: string; label: string; caption?: string };

type Format = 'vertical' | 'square';

const SIZES: Record<Format, { w: number; h: number; label: string }> = {
  vertical: { w: 720, h: 1280, label: 'Vertical 9:16 (Reels, TikTok, Shorts)' },
  square: { w: 1080, h: 1080, label: 'Square 1:1 (feed posts)' },
};

const SLIDE_SECONDS = 3;
const FADE_SECONDS = 0.5;
const FPS = 30;

function pickMime(): { mime: string; ext: string } | null {
  if (typeof MediaRecorder === 'undefined') return null;
  // MP4 (H.264) first: every social app accepts it and it carries a proper duration. Older
  // Chrome and Firefox only record WebM, which stays as the fallback.
  const options: [string, string][] = [
    ['video/mp4;codecs=avc1.42E01E', 'mp4'],
    ['video/mp4', 'mp4'],
    ['video/webm;codecs=vp9', 'webm'],
    ['video/webm;codecs=vp8', 'webm'],
    ['video/webm', 'webm'],
    ['video/mp4', 'mp4'],
  ];
  for (const [mime, ext] of options) {
    if (MediaRecorder.isTypeSupported(mime)) return { mime, ext };
  }
  return null;
}

async function loadBitmap(url: string): Promise<ImageBitmap> {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Could not load an image');
  return createImageBitmap(await response.blob());
}

// Draws one image "covered" into the frame with a slow zoom, then the caption on top.
function drawSlide(
  ctx: CanvasRenderingContext2D,
  bitmap: ImageBitmap,
  w: number,
  h: number,
  progress: number,
  caption: string,
  alpha: number,
) {
  const zoom = 1 + 0.12 * progress;
  const scale = Math.max(w / bitmap.width, h / bitmap.height) * zoom;
  const dw = bitmap.width * scale;
  const dh = bitmap.height * scale;
  ctx.globalAlpha = alpha;
  ctx.drawImage(bitmap, (w - dw) / 2, (h - dh) / 2, dw, dh);

  if (caption) {
    const size = Math.round(w * 0.065);
    ctx.font = `700 ${size}px Inter, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const maxWidth = w * 0.84;
    const words = caption.split(/\s+/);
    const lines: string[] = [];
    let line = '';
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
    const lineHeight = size * 1.25;
    const blockHeight = lines.length * lineHeight + size * 0.8;
    const top = h * 0.86 - blockHeight;
    const gradient = ctx.createLinearGradient(0, top - size, 0, h);
    gradient.addColorStop(0, 'rgba(0,0,0,0)');
    gradient.addColorStop(1, 'rgba(0,0,0,0.72)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, top - size, w, h - top + size);
    ctx.fillStyle = '#ffffff';
    lines.forEach((text, index) => {
      ctx.fillText(text, w / 2, top + size * 0.4 + lineHeight * (index + 0.5));
    });
  }
  ctx.globalAlpha = 1;
}

// Free video: the browser renders the slides and records them, so nothing is uploaded and no
// generation service is paid for. It makes motion slideshows with captions, not generated footage.
export function VideoMaker({ images, onClose }: { images: VideoImage[]; onClose: () => void }) {
  const [format, setFormat] = useState<Format>('vertical');
  const [selected, setSelected] = useState<boolean[]>(() => images.map(() => true));
  const [captions, setCaptions] = useState<string[]>(() => images.map((image) => image.caption ?? ''));
  const [phase, setPhase] = useState<'edit' | 'recording' | 'done' | 'error'>('edit');
  const [elapsed, setElapsed] = useState(0);
  const [result, setResult] = useState<{ url: string; ext: string; size: number } | null>(null);
  const [message, setMessage] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cancelRef = useRef(false);
  const support = typeof window !== 'undefined' ? pickMime() : null;

  useEffect(() => {
    return () => {
      cancelRef.current = true;
      if (result) URL.revokeObjectURL(result.url);
    };
  }, [result]);

  const chosen = images.map((image, index) => ({ image, caption: captions[index], on: selected[index] })).filter((item) => item.on);
  const totalSeconds = chosen.length * SLIDE_SECONDS;

  const record = useCallback(async () => {
    const picked = pickMime();
    const canvas = canvasRef.current;
    if (!picked || !canvas || chosen.length === 0) return;
    const { w, h } = SIZES[format];
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    cancelRef.current = false;
    setPhase('recording');
    setElapsed(0);
    setMessage('');
    try {
      const bitmaps = await Promise.all(chosen.map((item) => loadBitmap(item.image.url)));
      const stream = canvas.captureStream(FPS);
      const recorder = new MediaRecorder(stream, { mimeType: picked.mime, videoBitsPerSecond: 4_000_000 });
      const chunks: BlobPart[] = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      const finished = new Promise<Blob>((resolve) => {
        recorder.onstop = () => resolve(new Blob(chunks, { type: picked.mime.split(';')[0] }));
      });

      const total = chosen.length * SLIDE_SECONDS;
      const startedAt = performance.now();
      recorder.start(250);

      await new Promise<void>((resolve) => {
        const tick = () => {
          if (cancelRef.current) return resolve();
          const t = (performance.now() - startedAt) / 1000;
          if (t >= total) return resolve();
          const index = Math.min(chosen.length - 1, Math.floor(t / SLIDE_SECONDS));
          const local = t - index * SLIDE_SECONDS;
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, w, h);
          // Crossfade: the previous slide fades out while the current one fades in.
          if (index > 0 && local < FADE_SECONDS) {
            drawSlide(ctx, bitmaps[index - 1], w, h, 1, chosen[index - 1].caption, 1);
          }
          const fadeIn = index > 0 ? Math.min(1, local / FADE_SECONDS) : 1;
          drawSlide(ctx, bitmaps[index], w, h, local / SLIDE_SECONDS, chosen[index].caption, fadeIn);
          setElapsed(Math.min(total, t));
          requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });

      // Hold the last frame briefly so the recorder flushes it instead of clipping the end.
      if (!cancelRef.current) {
        const last = chosen.length - 1;
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, w, h);
        drawSlide(ctx, bitmaps[last], w, h, 1, chosen[last].caption, 1);
        await new Promise((resolve) => setTimeout(resolve, 450));
      }
      recorder.stop();
      const blob = await finished;
      stream.getTracks().forEach((track) => track.stop());
      if (cancelRef.current) {
        setPhase('edit');
        return;
      }
      if (blob.size < 1000) throw new Error('The recording came out empty');
      setResult({ url: URL.createObjectURL(blob), ext: picked.ext, size: blob.size });
      setPhase('done');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not make the video');
      setPhase('error');
    }
    // chosen/format are read at call time on purpose
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [format, selected, captions, images]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="Make a video">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl border border-line bg-background p-5 sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">Make a video</h2>
            <p className="text-xs text-muted">Built on your device from the images in this chat. Nothing is uploaded.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-muted transition hover:bg-overlay hover:text-foreground">
            <span aria-hidden="true">×</span>
          </button>
        </div>

        {!support ? (
          <p className="mt-4 rounded-xl border border-line bg-panel p-4 text-sm text-muted">
            This browser cannot record video. Try Chrome, Edge, Firefox or Safari 14.1 or newer.
          </p>
        ) : phase === 'done' && result ? (
          <div className="mt-4">
            <video src={result.url} controls playsInline className="mx-auto max-h-[60vh] rounded-xl border border-line" />
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <a href={result.url} download={`brandforge-video.${result.ext}`} className="bf-button bf-button-primary">
                Download .{result.ext} ({Math.round(result.size / 1024)} KB)
              </a>
              <button type="button" onClick={() => { setResult(null); setPhase('edit'); }} className="text-sm text-muted underline-offset-2 hover:text-foreground hover:underline">
                Edit and redo
              </button>
            </div>
            <p className="mt-2 text-xs text-muted">Labelled content: if you post this, say it uses AI-generated images.</p>
          </div>
        ) : (
          <>
            <fieldset className="mt-4" disabled={phase === 'recording'}>
              <legend className="text-xs uppercase tracking-[0.15em] text-muted">Format</legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {(Object.keys(SIZES) as Format[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={format === key}
                    onClick={() => setFormat(key)}
                    className={`rounded-full border px-3 py-1.5 text-xs transition ${format === key ? 'border-ember text-foreground' : 'border-line text-muted hover:border-ember/50'}`}
                  >
                    {SIZES[key].label}
                  </button>
                ))}
              </div>
            </fieldset>

            <ul className="mt-4 space-y-2">
              {images.map((image, index) => (
                <li key={image.url} className="flex gap-3 rounded-xl border border-line bg-panel p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element -- authenticated runtime path */}
                  <img src={image.url} alt={image.label} className="h-16 w-16 shrink-0 rounded-lg object-cover" />
                  <div className="min-w-0 flex-1">
                    <label className="flex items-center gap-2 text-xs text-muted">
                      <input
                        type="checkbox"
                        checked={selected[index]}
                        disabled={phase === 'recording'}
                        onChange={(event) => setSelected((current) => current.map((value, i) => (i === index ? event.target.checked : value)))}
                        className="accent-[var(--ember)]"
                      />
                      Use this image
                    </label>
                    <input
                      type="text"
                      value={captions[index]}
                      maxLength={90}
                      disabled={phase === 'recording' || !selected[index]}
                      onChange={(event) => setCaptions((current) => current.map((value, i) => (i === index ? event.target.value : value)))}
                      placeholder="Caption (optional)"
                      aria-label={`Caption for image ${index + 1}`}
                      className="mt-1 w-full rounded-lg border border-line bg-background px-2 py-1.5 text-sm text-foreground placeholder-muted outline-none focus:border-ember"
                    />
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => void record()} disabled={phase === 'recording' || chosen.length === 0} className="bf-button bf-button-primary disabled:opacity-50">
                {phase === 'recording' ? 'Recording…' : `Make video (${totalSeconds}s)`}
              </button>
              {phase === 'recording' ? (
                <>
                  <span className="flex items-center gap-2 text-sm text-muted" role="status">
                    <span className="bf-spinner" aria-hidden="true" />
                    {Math.ceil(elapsed)}s of {totalSeconds}s. Keep this tab open.
                  </span>
                  <button type="button" onClick={() => { cancelRef.current = true; }} className="text-sm text-muted underline-offset-2 hover:text-foreground hover:underline">
                    Cancel
                  </button>
                </>
              ) : null}
              {message ? <p role="alert" className="text-sm text-danger">{message}</p> : null}
            </div>
          </>
        )}

        <canvas ref={canvasRef} className="hidden" aria-hidden="true" />
      </div>
    </div>
  );
}
