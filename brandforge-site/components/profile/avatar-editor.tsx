'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { fetchAuthed } from '@/lib/browser-auth';
import { avatarTone, initialsFor } from '@/lib/identity-display';

const VIEW = 260; // the square the person sees
const OUT = 384; // the picture we keep

type Crop = { image: HTMLImageElement; zoom: number; x: number; y: number };

// Drawing the same crop at any size: the picture is scaled to cover the square, then zoomed and moved.
function draw(canvas: HTMLCanvasElement, crop: Crop, size: number) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  canvas.width = size;
  canvas.height = size;
  const base = Math.max(size / crop.image.naturalWidth, size / crop.image.naturalHeight) * crop.zoom;
  const w = crop.image.naturalWidth * base;
  const h = crop.image.naturalHeight * base;
  const k = size / VIEW;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(crop.image, size / 2 - w / 2 + crop.x * k, size / 2 - h / 2 + crop.y * k, w, h);
}

// Keeps the picture covering the square, so there is never an empty edge.
function clamp(crop: Crop): Crop {
  const base = Math.max(VIEW / crop.image.naturalWidth, VIEW / crop.image.naturalHeight) * crop.zoom;
  const maxX = Math.max(0, (crop.image.naturalWidth * base - VIEW) / 2);
  const maxY = Math.max(0, (crop.image.naturalHeight * base - VIEW) / 2);
  return { ...crop, x: Math.min(maxX, Math.max(-maxX, crop.x)), y: Math.min(maxY, Math.max(-maxY, crop.y)) };
}

function CropDialog({ file, onCancel, onSaved }: { file: File; onCancel: () => void; onSaved: (url: string) => void }) {
  const [crop, setCrop] = useState<Crop | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => setCrop({ image, zoom: 1, x: 0, y: 0 });
    image.onerror = () => setError('That file is not a picture we can read.');
    image.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (crop && canvas.current) draw(canvas.current, crop, VIEW);
  }, [crop]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onCancel();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  async function save() {
    if (!crop) return;
    setBusy(true);
    setError(null);
    try {
      const out = document.createElement('canvas');
      draw(out, crop, OUT);
      const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, 'image/jpeg', 0.88));
      if (!blob) return setError('Could not prepare the picture.');
      const form = new FormData();
      form.append('file', new File([blob], 'avatar.jpg', { type: 'image/jpeg' }));
      const res = await fetchAuthed('/api/profile/avatar', { method: 'POST', body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setError(data.error || 'Could not save the picture.');
      onSaved(data.url as string);
    } catch {
      setError('Could not reach the server. Check your connection.');
    } finally {
      setBusy(false);
    }
  }

  const modal = (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/50 p-3 sm:items-center" role="dialog" aria-modal="true" aria-label="Choose your picture">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-panel p-5">
        <p className="font-serif text-lg text-foreground">Your picture</p>
        <p className="mt-0.5 text-xs text-muted">Drag to move it. Use the slider to zoom.</p>
        <div className="mt-4 flex justify-center">
          <div className="relative overflow-hidden rounded-full border border-line" style={{ width: VIEW, height: VIEW }}>
            <canvas
              ref={canvas}
              width={VIEW}
              height={VIEW}
              className="block cursor-grab touch-none active:cursor-grabbing"
              style={{ width: VIEW, height: VIEW }}
              aria-label="Picture preview, drag to move"
              onPointerDown={(event) => {
                if (!crop) return;
                (event.target as HTMLElement).setPointerCapture(event.pointerId);
                drag.current = { x: event.clientX, y: event.clientY, cx: crop.x, cy: crop.y };
              }}
              onPointerMove={(event) => {
                const start = drag.current;
                if (!start || !crop) return;
                setCrop(clamp({ ...crop, x: start.cx + (event.clientX - start.x), y: start.cy + (event.clientY - start.y) }));
              }}
              onPointerUp={() => (drag.current = null)}
              onPointerCancel={() => (drag.current = null)}
              onWheel={(event) => crop && setCrop(clamp({ ...crop, zoom: Math.min(4, Math.max(1, crop.zoom - event.deltaY * 0.002)) }))}
            />
          </div>
        </div>
        <label className="mt-4 flex items-center gap-3 text-xs text-muted">
          Zoom
          <input type="range" min={1} max={4} step={0.01} value={crop?.zoom ?? 1} disabled={!crop} onChange={(event) => crop && setCrop(clamp({ ...crop, zoom: Number(event.target.value) }))} className="flex-1 accent-[var(--ember)]" />
        </label>
        {error ? <p role="alert" className="mt-3 text-sm text-danger">{error}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded-lg border border-line px-3.5 py-2 text-sm text-foreground transition hover:border-ember">Cancel</button>
          <button type="button" onClick={() => void save()} disabled={!crop || busy} className="rounded-lg bg-ember px-4 py-2 text-sm font-semibold text-background transition hover:opacity-90 disabled:opacity-50">{busy ? 'Saving…' : 'Use this picture'}</button>
        </div>
      </div>
    </div>
  );
  return typeof document === 'undefined' ? null : createPortal(modal, document.body);
}

// Change or remove your profile picture. Tap the picture (or the button), choose a photo, move and zoom it, done.
// Photos are cropped and shrunk on your own device first, so a big camera photo is fine.
export function AvatarEditor({ name, seed, url, onChange, size = 64 }: { name: string; seed: string; url: string | null; onChange: (url: string | null) => void; size?: number }) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);

  function pick(chosen: File | undefined) {
    setError(null);
    if (!chosen) return;
    if (!chosen.type.startsWith('image/')) return setError('Pick a picture file.');
    if (chosen.size > 25 * 1024 * 1024) return setError('That picture is over 25 MB. Pick a smaller one.');
    setFile(chosen);
  }

  async function remove() {
    setRemoving(true);
    setError(null);
    try {
      const res = await fetchAuthed('/api/profile/avatar', { method: 'DELETE' });
      if (!res.ok) return setError('Could not remove the picture. Try again.');
      onChange(null);
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={() => input.current?.click()}
        aria-label="Change profile picture"
        className="group relative shrink-0 rounded-full"
        style={{ width: size, height: size }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          pick(event.dataTransfer.files?.[0]);
        }}
      >
        <span className="flex h-full w-full items-center justify-center overflow-hidden rounded-full text-xl font-semibold" style={avatarTone(seed)}>
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element -- a small user picture from our own storage
            <img src={url} alt="" decoding="async" className="h-full w-full object-cover" />
          ) : (
            initialsFor(name)
          )}
        </span>
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/55 text-[11px] font-semibold text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">Change</span>
      </button>
      <div className="min-w-0">
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => input.current?.click()} className="rounded-lg border border-line px-3 py-1.5 text-xs text-foreground transition hover:border-ember">{url ? 'Change photo' : 'Add a photo'}</button>
          {url ? <button type="button" onClick={() => void remove()} disabled={removing} className="rounded-lg px-3 py-1.5 text-xs text-muted transition hover:text-danger disabled:opacity-50">{removing ? 'Removing…' : 'Remove'}</button> : null}
        </div>
        {error ? <p role="alert" className="mt-1.5 text-xs text-danger">{error}</p> : null}
      </div>
      <input ref={input} type="file" accept="image/*" className="sr-only" aria-hidden="true" tabIndex={-1} onChange={(event) => { pick(event.target.files?.[0]); event.target.value = ''; }} />
      {file ? <CropDialog file={file} onCancel={() => setFile(null)} onSaved={(saved) => { setFile(null); onChange(saved); }} /> : null}
    </div>
  );
}
