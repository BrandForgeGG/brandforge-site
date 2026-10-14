'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getSessionUser } from '@/lib/browser-auth';
import { trackEvent } from '@/lib/funnel-client';
import { useLogin } from '@/components/login-dialog';
import { loadFonts } from '@/components/carousel/carousel-shared';
import { THEMES } from '@/lib/carousel-render.js';
import { VIDEO_FORMATS, fitToVoice, totalSeconds, type VideoFormat, type VideoScene, planToScenes } from '@/lib/video-scenes.js';
import { canEncode, drawFrame, encodeVideo, lookOf, makeArt } from '@/components/video/video-engine';
import { VOICES, clipsFor, layTrack, playClips, type Clip, type VoiceId } from '@/components/video/voice';
import { YouTubePost } from '@/components/video/youtube-post';

const field = 'w-full rounded-xl border border-line bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted focus:border-ember focus:outline-none';
const chip = 'rounded-full border px-3 py-1.5 text-xs transition';
const LOOKS = Object.keys(THEMES);
const NEWLINE = String.fromCharCode(10);

function startsOf(scenes: VideoScene[]): number[] {
  const starts: number[] = [];
  let at = 0;
  for (const scene of scenes) {
    starts.push(at);
    at += scene.seconds;
  }
  return starts;
}

// The video maker on Create: say what the video is about and whether it should be spoken, get scenes written for you (edit
// every word), watch and hear the preview, then make the MP4. The voice is recorded as soon as the scenes exist (and again
// after an edit), so the preview plays with it and the MP4 uses exactly what was heard. Frames are drawn and encoded in
// your own browser; the voice comes from our server.
export function VideoMaker({ initialFormat = 'short' }: { initialFormat?: VideoFormat }) {
  const { openLogin } = useLogin();
  const [format, setFormat] = useState<VideoFormat>(initialFormat);
  const [topic, setTopic] = useState('');
  const [brand, setBrand] = useState('');
  const [handle, setHandle] = useState('');
  const [theme, setTheme] = useState('forge');
  const [scenes, setScenes] = useState<VideoScene[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [withVoice, setWithVoice] = useState(true);
  const [voice, setVoice] = useState<VoiceId>('af_heart');
  const [clips, setClips] = useState<Clip[] | null>(null);
  const [voiceState, setVoiceState] = useState<{ status: 'idle' | 'working' | 'ready' | 'failed'; text: string }>({ status: 'idle', text: '' });
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ url: string; name: string; seconds: number; voiced: boolean; blob: Blob } | null>(null);
  const [fontsReady, setFontsReady] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stopRef = useRef<AbortController | null>(null);

  const f = VIDEO_FORMATS[format];
  const look = lookOf(theme);
  const art = useMemo(() => (typeof document === 'undefined' ? null : makeArt(f.w, f.h, look, `${theme}-${format}`)), [f.w, f.h, look, theme, format]);
  const voiced = withVoice && clips !== null && clips.length === scenes.length;
  // With a voice, each scene stays up at least as long as its words take to say.
  const timed = useMemo(() => (voiced && clips ? fitToVoice(scenes, clips.map((clip) => clip.seconds)) : scenes), [voiced, clips, scenes]);
  const seconds = totalSeconds(timed);
  const voiceText = scenes.map((scene) => scene.voice).join('|');

  useEffect(() => {
    void loadFonts().then(() => setFontsReady(true));
  }, []);

  // Record the voice once the scenes exist, and again shortly after the words or the voice change.
  useEffect(() => {
    if (!withVoice || scenes.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the voice follows the scenes and the tick box
      setClips(null);
      setVoiceState({ status: 'idle', text: '' });
      return;
    }
    let live = true;
    setClips(null);
    setVoiceState({ status: 'working', text: 'Recording the voice-over…' });
    const timer = window.setTimeout(() => {
      void clipsFor(scenes.map((scene) => scene.voice), voice, (done, total) => live && setVoiceState({ status: 'working', text: `Recording the voice-over, ${done} of ${total}…` }))
        .then((made) => {
          if (!live) return;
          setClips(made);
          setVoiceState({ status: 'ready', text: 'Voice-over ready. Press Play to hear it.' });
        })
        .catch((cause) => live && setVoiceState({ status: 'failed', text: cause instanceof Error ? cause.message : 'The voice is not available right now.' }));
    }, 700);
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- voiceText stands for the scenes' words
  }, [withVoice, voice, voiceText]);

  // The preview: a still frame when stopped; when playing, the animation with the voice in time.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !art || !fontsReady || timed.length === 0) return;
    canvas.width = f.w;
    canvas.height = f.h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const brandInfo = { name: brand.trim(), handle: handle.trim() };
    if (!playing) {
      drawFrame(ctx, f.w, f.h, timed, 0.9, look, brandInfo, art);
      return;
    }
    const stopVoice = voiced && clips ? playClips(clips, startsOf(timed)) : () => undefined;
    const start = performance.now() + 50;
    let frame = 0;
    const tick = () => {
      const t = Math.max(0, (performance.now() - start) / 1000);
      if (t >= seconds) {
        setPlaying(false);
        return;
      }
      drawFrame(ctx, f.w, f.h, timed, t, look, brandInfo, art);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      stopVoice();
    };
  }, [timed, playing, art, fontsReady, f.w, f.h, look, brand, handle, seconds, voiced, clips]);

  useEffect(() => () => {
    if (result) URL.revokeObjectURL(result.url);
  }, [result]);

  async function write() {
    if (topic.trim().length < 6) {
      setError('Say what the video is about in a sentence or two.');
      return;
    }
    setError(null);
    setPlaying(false);
    setBusy('Writing the scenes…');
    try {
      const res = await fetch('/api/carousel/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'words', type: 'list', topic: topic.trim(), count: format === 'long' ? 7 : format === 'square' ? 5 : 4 }),
      });
      const data = (await res.json().catch(() => ({}))) as { plan?: unknown; error?: string };
      if (!res.ok || !data.plan) throw new Error(data.error || 'The writer could not make the scenes. Try again.');
      setScenes(planToScenes(data.plan, format));
      setResult(null);
      trackEvent('create_interest', { status: `video-${format}` });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The writer could not make the scenes.');
    } finally {
      setBusy(null);
    }
  }

  function editScene(i: number, patch: Partial<VideoScene>) {
    setPlaying(false);
    setScenes((current) => current.map((scene, n) => (n === i ? { ...scene, ...patch, voice: patch.heading !== undefined || patch.lines !== undefined ? [patch.heading ?? scene.heading, ...(patch.lines ?? scene.lines)].filter(Boolean).join('. ') : scene.voice } : scene)));
    setResult(null);
  }

  async function make() {
    if (!art || scenes.length === 0 || busy) return;
    if (!(await getSessionUser().catch(() => null))) {
      openLogin({ reason: 'carousel', next: `/create?make=video-${format}` });
      return;
    }
    if (!canEncode()) {
      setError('This browser cannot make MP4 video. Open BrandForge in a recent Chrome, Edge or Safari.');
      return;
    }
    if (withVoice && !voiced) {
      setError(voiceState.status === 'failed' ? 'The voice-over is not ready. Untick it to make the video without a voice, or try again.' : 'The voice-over is still recording. It is ready in a moment.');
      return;
    }
    setError(null);
    setPlaying(false);
    const controller = new AbortController();
    stopRef.current = controller;
    try {
      const track = voiced && clips ? layTrack(clips, startsOf(timed), seconds) : null;
      setBusy('Making the video…');
      setProgress(0);
      const blob = await encodeVideo({ w: f.w, h: f.h, scenes: timed, look, brand: { name: brand.trim(), handle: handle.trim() }, art, voice: track, onProgress: setProgress, signal: controller.signal });
      if (result) URL.revokeObjectURL(result.url);
      setResult({ url: URL.createObjectURL(blob), name: `brandforge-${format}-video.mp4`, seconds, voiced: Boolean(track), blob });
      trackEvent('carousel_downloaded', { source: `video-${format}` });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not make the video.');
    } finally {
      setBusy(null);
      stopRef.current = null;
    }
  }

  const voicePicker = (
    <div className="mt-3 rounded-xl border border-line bg-background p-3">
      <label className="flex items-start gap-2 text-sm text-foreground">
        <input type="checkbox" checked={withVoice} onChange={(event) => { setWithVoice(event.target.checked); setResult(null); setPlaying(false); }} className="mt-1" />
        <span>
          Voice-over
          <span className="block text-xs text-muted">A natural voice reads every scene, free. English voices.</span>
        </span>
      </label>
      {withVoice ? (
        <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Voice">
          {VOICES.map((option) => (
            <button key={option.id} type="button" aria-pressed={voice === option.id} onClick={() => { setVoice(option.id); setResult(null); setPlaying(false); }} className={`${chip} ${voice === option.id ? 'border-ember bg-ember/10 text-foreground' : 'border-line text-muted hover:text-foreground'}`}>
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );

  return (
    <div className="space-y-6">
      <section aria-label="What is the video about" className="rounded-2xl border border-line bg-panel p-4 sm:p-5">
        <label htmlFor="video-topic" className="font-serif text-lg text-foreground">What is the video about?</label>
        <textarea id="video-topic" value={topic} onChange={(event) => setTopic(event.target.value)} rows={3} maxLength={1500} placeholder="Say it in a sentence or two. The scenes are written for you." className={`${field} mt-2 text-base`} />
        <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label="Shape">
          {(Object.keys(VIDEO_FORMATS) as VideoFormat[]).map((id) => (
            <button key={id} type="button" aria-pressed={format === id} onClick={() => { setFormat(id); setResult(null); }} className={`${chip} ${format === id ? 'border-ember bg-ember/10 text-foreground' : 'border-line text-muted hover:text-foreground'}`}>
              {VIDEO_FORMATS[id].label} <span className="text-muted">· {VIDEO_FORMATS[id].note}</span>
            </button>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <input value={brand} onChange={(event) => setBrand(event.target.value)} maxLength={40} placeholder="Name on the video (optional)" aria-label="Name on the video" className="min-w-0 flex-1 rounded-lg border border-line bg-background px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted focus:border-ember focus:outline-none sm:max-w-[14rem]" />
          <input value={handle} onChange={(event) => setHandle(event.target.value)} maxLength={40} placeholder="@handle or site (optional)" aria-label="Handle or site" className="min-w-0 flex-1 rounded-lg border border-line bg-background px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted focus:border-ember focus:outline-none sm:max-w-[14rem]" />
        </div>
        {voicePicker}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void write()} disabled={Boolean(busy)} className="rounded-xl bg-ember px-5 py-2.5 text-sm font-semibold text-background transition hover:opacity-90 disabled:opacity-60">
            {scenes.length > 0 ? 'Write the scenes again' : 'Write the scenes'}
          </button>
          {busy ? <span role="status" className="text-sm text-muted">{busy}</span> : null}
        </div>
        {error ? <p role="alert" className="mt-2 text-sm text-danger">{error}</p> : null}
      </section>

      {scenes.length > 0 ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="space-y-3">
            <div className="flex items-center justify-center rounded-2xl border border-line bg-background p-3">
              <canvas ref={canvasRef} className="max-h-[60vh] w-auto max-w-full rounded-lg shadow-lg" style={{ aspectRatio: `${f.w} / ${f.h}` }} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setPlaying((value) => !value)} disabled={withVoice && voiceState.status === 'working'} className="rounded-lg border border-line px-3 py-1.5 text-xs text-foreground transition hover:border-ember disabled:opacity-60">
                {playing ? 'Stop' : voiced ? 'Play with voice' : withVoice && voiceState.status === 'working' ? 'Recording the voice…' : 'Play the preview'}
              </button>
              <span className="text-xs text-muted">{timed.length} scenes, about {Math.round(seconds)} seconds</span>
            </div>
            {withVoice && voiceState.text ? <p role={voiceState.status === 'failed' ? 'alert' : 'status'} className={`text-xs ${voiceState.status === 'failed' ? 'text-danger' : 'text-muted'}`}>{voiceState.text}</p> : null}
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Look">
              {LOOKS.map((id) => (
                <button key={id} type="button" aria-pressed={theme === id} onClick={() => { setTheme(id); setResult(null); }} className={`${chip} ${theme === id ? 'border-ember bg-ember/10 text-foreground' : 'border-line text-muted hover:text-foreground'}`}>
                  {(THEMES as Record<string, { label: string }>)[id].label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <ol className="space-y-2">
              {timed.map((scene, i) => (
                <li key={i} className="rounded-xl border border-line bg-panel p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                    {scene.kind === 'title' ? 'Opening' : scene.kind === 'end' ? 'Close' : `Scene ${i}`} · {scene.seconds}s
                  </p>
                  <input value={scenes[i].heading} onChange={(event) => editScene(i, { heading: event.target.value.slice(0, 90) })} aria-label={`Scene ${i + 1} heading`} className={`${field} mt-1.5`} />
                  <textarea value={scenes[i].lines.join(NEWLINE)} onChange={(event) => editScene(i, { lines: event.target.value.split(NEWLINE).map((line) => line.slice(0, 110)).slice(0, 3) })} rows={Math.max(1, scenes[i].lines.length)} aria-label={`Scene ${i + 1} lines, one per line`} className={`${field} mt-1.5 text-[13px]`} />
                </li>
              ))}
            </ol>

            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => void make()} disabled={Boolean(busy) || !fontsReady || (withVoice && voiceState.status === 'working')} className="rounded-xl bg-ember px-5 py-2.5 text-sm font-semibold text-background transition hover:opacity-90 disabled:opacity-60">
                {busy === 'Making the video…' ? `Making the video, ${Math.round(progress * 100)}%` : withVoice && voiceState.status === 'working' ? 'Waiting for the voice…' : 'Make the MP4'}
              </button>
              {busy ? <button type="button" onClick={() => stopRef.current?.abort()} className="px-2 py-2 text-xs text-muted hover:text-foreground">Stop</button> : null}
            </div>
            {result ? (
              <div className="rounded-xl border border-trust/30 bg-trust/10 p-3">
                <p className="text-sm text-foreground">Your video is ready: {Math.round(result.seconds)} seconds{result.voiced ? ', with voice-over' : ''}.</p>
                <video src={result.url} controls playsInline className="mt-2 max-h-72 w-auto max-w-full rounded-lg" />
                <a href={result.url} download={result.name} className="mt-2 inline-block rounded-lg bg-ember px-4 py-2 text-sm font-semibold text-background transition hover:opacity-90">Download MP4</a>
                <YouTubePost blob={result.blob} defaultTitle={scenes[0]?.heading ?? ''} defaultDescription={[...scenes.map((scene) => [scene.heading, ...scene.lines].join(': ')), handle.trim()].filter(Boolean).join(NEWLINE)} vertical={f.h > f.w} seconds={result.seconds} />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
