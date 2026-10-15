'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getSessionUser } from '@/lib/browser-auth';
import { trackEvent } from '@/lib/funnel-client';
import { useLogin } from '@/components/login-dialog';
import { fitToVoice, totalSeconds } from '@/lib/video-scenes.js';
import type { LaunchScene } from '@/lib/launch-video.js';
import { canEncode, encodeFrames } from '@/components/video/video-engine';
import { drawLaunchFrame, loadLaunchFonts, type LaunchLook, type LaunchMedia } from '@/components/video/launch-engine';
import { VOICES, clipsFor, layTrack, playClips, type Clip, type VoiceId } from '@/components/video/voice';
import { YouTubePost } from '@/components/video/youtube-post';
import { posterOf } from '@/components/drafts/drafts-store';
import { postVideoToChat, type ChatTarget } from '@/components/chat/post-creation';
import { useAutosave, useDraft } from '@/components/drafts/use-draft';

const field = 'w-full rounded-xl border border-line bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted focus:border-ember focus:outline-none';
const chip = 'rounded-full border px-3 py-1.5 text-xs transition';
const NEWLINE = String.fromCharCode(10);

const SHAPES = {
  wide: { label: 'Widescreen', note: '16:9, YouTube and sites', w: 1920, h: 1080 },
  tall: { label: 'Vertical', note: '9:16, Shorts, Reels, TikTok', w: 1080, h: 1920 },
} as const;
type Shape = keyof typeof SHAPES;

type SiteInfo = { name: string; host: string; url: string; colors: LaunchLook; shot: string; pictures: { src: string; label: string }[] };

const KIND_LABEL: Record<LaunchScene['kind'], string> = { hook: 'Opening', problem: 'The problem', tour: 'Your site', features: 'What it does', steps: 'How it works', proof: 'Real pictures', cta: 'Close' };
const DEFAULT_LOOK: LaunchLook = { bg: '#0f0e0d', text: '#f4f1ec', accent: '#ff6a2b', dark: true };

/** What a launch video draft keeps, to reopen it as it was. */
type LaunchState = { url: string; about: string; shape: Shape; withVoice: boolean; voice: VoiceId; scenes: LaunchScene[]; site: SiteInfo | null; look: LaunchLook };

function slugOf(name: string): string {
  return (name || 'launch').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'launch';
}

async function bitmap(src: string): Promise<ImageBitmap | null> {
  const res = await fetch(src).catch(() => null);
  if (!res || !res.ok) return null;
  return createImageBitmap(await res.blob()).catch(() => null);
}

function startsOf(scenes: { seconds: number }[]): number[] {
  const starts: number[] = [];
  let at = 0;
  for (const scene of scenes) {
    starts.push(at);
    at += scene.seconds;
  }
  return starts;
}

// The launch video maker on Create: paste a website (or describe the product), and a launch story is written from the
// page's own words, drawn in the site's own colours with a scrolling look at the real site and its real pictures, voiced,
// and made into an MP4 in your browser. Free; signing in is only needed to download or post it.
// In a chat (chat set), the finished MP4 is saved into that chat as a new version instead of shown here.
export function LaunchMaker({ draftId, onDraftId, chat }: { draftId?: string; onDraftId?: (id: string) => void; chat?: ChatTarget } = {}) {
  const { openLogin } = useLogin();
  const draft = useDraft('video-launch', draftId, onDraftId);
  const [url, setUrl] = useState('');
  const [about, setAbout] = useState('');
  const [shape, setShape] = useState<Shape>('wide');
  const [scenes, setScenes] = useState<LaunchScene[]>([]);
  const [site, setSite] = useState<SiteInfo | null>(null);
  const [look, setLook] = useState<LaunchLook>(DEFAULT_LOOK);
  const [media, setMedia] = useState<LaunchMedia>({ name: '', host: '', shot: null, pictures: [] });
  const [loadingPictures, setLoadingPictures] = useState<string | null>(null);
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

  const f = SHAPES[shape];
  const voiced = withVoice && clips !== null && clips.length === scenes.length;
  const timed = useMemo(() => (voiced && clips ? fitToVoice(scenes, clips.map((clip) => clip.seconds + 0.3)) : scenes), [voiced, clips, scenes]);
  const seconds = totalSeconds(timed);
  const voiceText = scenes.map((scene) => scene.voice).join('|');

  useEffect(() => {
    void loadLaunchFonts().then(() => setFontsReady(true));
  }, []);

  // Reopening a draft: its words, settings and (when it was made) the finished MP4.
  useEffect(() => {
    let live = true;
    // Reopened from a version in the chat: that version's words and settings. Otherwise the work in progress, if any.
    const opening: Promise<{ state?: unknown; video?: Blob; seconds?: number } | null> = chat?.initialState ? Promise.resolve({ state: chat.initialState }) : draft.load();
    void opening.then((saved) => {
      if (!live || !saved) return;
      const s = saved.state as LaunchState | null;
      if (s) {
        setUrl(s.url);
        setAbout(s.about);
        setShape(s.shape);
        setWithVoice(s.withVoice);
        setVoice(s.voice);
        setScenes(s.scenes);
        setSite(s.site);
        setLook(s.look);
      }
      if (saved.video) setResult({ url: URL.createObjectURL(saved.video), name: `${slugOf(s?.site?.name ?? '')}-launch-video.mp4`, seconds: saved.seconds ?? 0, voiced: Boolean(s?.withVoice), blob: saved.video });
    });
    return () => {
      live = false;
    };
  }, [draft, chat?.initialState]);

  // Keep the draft up to date while working; an edit after the MP4 was made drops the old MP4 from the draft.
  const draftState: LaunchState = { url, about, shape, withVoice, voice, scenes, site, look };
  useAutosave({ draftState, made: Boolean(result) }, scenes.length > 0, () =>
    void draft.save({ title: scenes[0]?.heading || site?.name || 'Launch video', state: draftState, ...(result ? {} : { video: undefined, poster: undefined, seconds: undefined }) })
  );

  // The site's pictures and a screenshot of it, loaded once the story is written.
  useEffect(() => {
    if (!site) return;
    let live = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the pictures follow the site that was read
    setMedia({ name: site.name, host: site.host, shot: null, pictures: [] });
    setLoadingPictures('Taking a picture of your site…');
    void Promise.all([
      bitmap(site.shot),
      Promise.all(site.pictures.map(async (picture) => ({ image: await bitmap(picture.src), label: picture.label }))),
    ]).then(([shot, pictures]) => {
      if (!live) return;
      const usable = pictures.filter((p): p is { image: ImageBitmap; label: string } => Boolean(p.image && p.image.width >= 200 && p.image.height >= 120));
      setMedia({ name: site.name, host: site.host, shot, pictures: usable });
      setLoadingPictures(null);
      // Without real pictures there is nothing to show in the proof scene.
      if (usable.length < 2) setScenes((current) => current.filter((scene) => scene.kind !== 'proof'));
    });
    return () => {
      live = false;
    };
  }, [site]);

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

  // The preview: a still of the opening when stopped; when playing, the animation with the voice in time.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !fontsReady || timed.length === 0) return;
    canvas.width = f.w;
    canvas.height = f.h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (!playing) {
      drawLaunchFrame(ctx, f.w, f.h, timed, Math.min(2.4, timed[0].seconds - 0.4), look, media);
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
      drawLaunchFrame(ctx, f.w, f.h, timed, t, look, media);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      stopVoice();
    };
  }, [timed, playing, fontsReady, f.w, f.h, look, media, seconds, voiced, clips]);

  useEffect(() => () => {
    if (result) URL.revokeObjectURL(result.url);
  }, [result]);

  async function write() {
    if (!url.trim() && about.trim().length < 12) {
      setError('Paste your website, or say what you are launching in a sentence or two.');
      return;
    }
    setError(null);
    setPlaying(false);
    setBusy(url.trim() ? 'Reading your site and writing the story…' : 'Writing the story…');
    try {
      const res = await fetch('/api/create/launch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: url.trim(), about: about.trim() }) });
      const data = (await res.json().catch(() => ({}))) as { site?: SiteInfo | null; scenes?: LaunchScene[]; error?: string };
      if (!res.ok || !data.scenes) throw new Error(data.error || 'The writer could not make the story. Try again.');
      setScenes(data.scenes);
      setSite(data.site ?? null);
      setLook(data.site?.colors ?? DEFAULT_LOOK);
      if (!data.site) setMedia({ name: '', host: '', shot: null, pictures: [] });
      setResult(null);
      trackEvent('create_interest', { status: 'video-launch' });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The writer could not make the story.');
    } finally {
      setBusy(null);
    }
  }

  function editScene(i: number, patch: Partial<{ heading: string; voice: string }>) {
    setPlaying(false);
    setScenes((current) => current.map((scene, n) => (n === i ? ({ ...scene, ...patch } as LaunchScene) : scene)));
    setResult(null);
  }

  async function make() {
    if (scenes.length === 0 || busy) return;
    if (!(await getSessionUser().catch(() => null))) {
      openLogin({ reason: 'carousel', next: chat ? `/chat?conversationId=${chat.conversationId}` : '/create?make=video-launch' });
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
      const blob = await encodeFrames({ w: f.w, h: f.h, seconds, draw: (ctx, t) => drawLaunchFrame(ctx, f.w, f.h, timed, t, look, media), voice: track, onProgress: setProgress, signal: controller.signal });
      if (chat) {
        // In a chat, the video becomes its newest version there (the chat is its draft).
        setBusy('Saving it to the chat…');
        const poster = canvasRef.current ? await posterOf(canvasRef.current) : null;
        await postVideoToChat(chat.conversationId, { blob, poster, maker: 'launch', title: scenes[0]?.heading || media.name || 'Launch video', state: draftState, seconds, vertical: f.h > f.w });
        await draft.remove();
        trackEvent('carousel_downloaded', { source: 'video-launch' });
        chat.onPosted();
        return;
      }
      if (result) URL.revokeObjectURL(result.url);
      setResult({ url: URL.createObjectURL(blob), name: `${slugOf(media.name)}-launch-video.mp4`, seconds, voiced: Boolean(track), blob });
      // The finished MP4 goes into the draft, so a refresh keeps it until it is published.
      const poster = canvasRef.current ? await posterOf(canvasRef.current) : null;
      void draft.save({ title: scenes[0]?.heading || media.name || 'Launch video', state: draftState, video: blob, poster: poster ?? undefined, seconds });
      trackEvent('carousel_downloaded', { source: 'video-launch' });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not make the video.');
    } finally {
      setBusy(null);
      stopRef.current = null;
    }
  }

  const colorInput = (key: 'bg' | 'text' | 'accent', label: string) => (
    <label className="flex items-center gap-1.5 text-xs text-muted">
      <input type="color" value={look[key]} onChange={(event) => { setLook((current) => ({ ...current, [key]: event.target.value })); setResult(null); }} className="h-7 w-9 cursor-pointer rounded border border-line bg-transparent" aria-label={`${label} colour`} />
      {label}
    </label>
  );

  return (
    <div className="space-y-6">
      <section aria-label="What are you launching" className="rounded-2xl border border-line bg-panel p-4 sm:p-5">
        <label htmlFor="launch-url" className="font-serif text-lg text-foreground">Your website</label>
        <input id="launch-url" value={url} onChange={(event) => setUrl(event.target.value)} inputMode="url" maxLength={300} placeholder="yourproduct.com" className={`${field} mt-2 text-base`} />
        <label htmlFor="launch-about" className="mt-3 block text-sm text-foreground">Anything to add <span className="text-muted">(optional, or use this alone if you have no site yet)</span></label>
        <textarea id="launch-about" value={about} onChange={(event) => setAbout(event.target.value)} rows={2} maxLength={1200} placeholder="Who it is for, what is new, the one thing people should remember." className={`${field} mt-1.5`} />
        <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label="Shape">
          {(Object.keys(SHAPES) as Shape[]).map((id) => (
            <button key={id} type="button" aria-pressed={shape === id} onClick={() => { setShape(id); setResult(null); }} className={`${chip} ${shape === id ? 'border-ember bg-ember/10 text-foreground' : 'border-line text-muted hover:text-foreground'}`}>
              {SHAPES[id].label} <span className="text-muted">· {SHAPES[id].note}</span>
            </button>
          ))}
        </div>
        <div className="mt-3 rounded-xl border border-line bg-background p-3">
          <label className="flex items-start gap-2 text-sm text-foreground">
            <input type="checkbox" checked={withVoice} onChange={(event) => { setWithVoice(event.target.checked); setResult(null); setPlaying(false); }} className="mt-1" />
            <span>
              Voice-over
              <span className="block text-xs text-muted">A natural voice narrates the launch, free. English voices.</span>
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
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void write()} disabled={Boolean(busy)} className="rounded-xl bg-ember px-5 py-2.5 text-sm font-semibold text-on-ember transition hover:opacity-90 disabled:opacity-60">
            {scenes.length > 0 ? 'Write it again' : 'Write the launch video'}
          </button>
          {busy ? <span role="status" className="text-sm text-muted">{busy}</span> : null}
        </div>
        <p className="mt-2 text-xs text-muted">Written only from what your site says. Check every line before you post it.</p>
        {error ? <p role="alert" className="mt-2 text-sm text-danger">{error}</p> : null}
      </section>

      {scenes.length > 0 ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
          <div className="space-y-3">
            <div className="flex items-center justify-center rounded-2xl border border-line bg-background p-3">
              <canvas ref={canvasRef} className="max-h-[62vh] w-auto max-w-full rounded-lg shadow-lg" style={{ aspectRatio: `${f.w} / ${f.h}` }} />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setPlaying((value) => !value)} disabled={withVoice && voiceState.status === 'working'} className="rounded-lg border border-line px-3 py-1.5 text-xs text-foreground transition hover:border-ember disabled:opacity-60">
                {playing ? 'Stop' : voiced ? 'Play with voice' : withVoice && voiceState.status === 'working' ? 'Recording the voice…' : 'Play the preview'}
              </button>
              <span className="text-xs text-muted">{timed.length} scenes, about {Math.round(seconds)} seconds</span>
            </div>
            {loadingPictures ? <p role="status" className="text-xs text-muted">{loadingPictures}</p> : null}
            {withVoice && voiceState.text ? <p role={voiceState.status === 'failed' ? 'alert' : 'status'} className={`text-xs ${voiceState.status === 'failed' ? 'text-danger' : 'text-muted'}`}>{voiceState.text}</p> : null}
            <div className="flex flex-wrap items-center gap-3" role="group" aria-label="Colours">
              {colorInput('bg', 'Ground')}
              {colorInput('text', 'Words')}
              {colorInput('accent', 'Accent')}
              {site ? <button type="button" onClick={() => setLook(site.colors)} className="text-xs text-muted underline-offset-2 hover:text-foreground hover:underline">Use the site&apos;s colours</button> : null}
            </div>
          </div>

          <div className="space-y-3">
            <ol className="space-y-2">
              {timed.map((scene, i) => (
                <li key={`${scene.kind}-${i}`} className="rounded-xl border border-line bg-panel p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{KIND_LABEL[scene.kind]} · {scene.seconds}s</p>
                  <input value={scenes[i].heading} onChange={(event) => editScene(i, { heading: event.target.value.slice(0, 70) })} aria-label={`${KIND_LABEL[scene.kind]} words on screen`} className={`${field} mt-1.5`} />
                  <textarea value={scenes[i].voice} onChange={(event) => editScene(i, { voice: event.target.value.replace(new RegExp(NEWLINE, 'g'), ' ').slice(0, 220) })} rows={2} aria-label={`${KIND_LABEL[scene.kind]} spoken words`} className={`${field} mt-1.5 text-[13px]`} />
                </li>
              ))}
            </ol>

            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => void make()} disabled={Boolean(busy) || !fontsReady || Boolean(loadingPictures) || (withVoice && voiceState.status === 'working')} className="rounded-xl bg-ember px-5 py-2.5 text-sm font-semibold text-on-ember transition hover:opacity-90 disabled:opacity-60">
                {busy === 'Making the video…' ? `Making the video, ${Math.round(progress * 100)}%` : loadingPictures ? 'Waiting for the pictures…' : withVoice && voiceState.status === 'working' ? 'Waiting for the voice…' : chat ? 'Make the video' : 'Make the MP4'}
              </button>
              {busy ? <button type="button" onClick={() => stopRef.current?.abort()} className="px-2 py-2 text-xs text-muted hover:text-foreground">Stop</button> : null}
            </div>
            {result ? (
              <div className="rounded-xl border border-trust/30 bg-trust/10 p-3">
                <p className="text-sm text-foreground">Your launch video is ready: {Math.round(result.seconds)} seconds{result.voiced ? ', with voice-over' : ''}.</p>
                <video src={result.url} controls playsInline className="mt-2 max-h-72 w-auto max-w-full rounded-lg" />
                <a href={result.url} download={result.name} className="mt-2 inline-block rounded-lg bg-ember px-4 py-2 text-sm font-semibold text-on-ember transition hover:opacity-90">Download MP4</a>
                <YouTubePost blob={result.blob} defaultTitle={`${media.name ? `${media.name}: ` : ''}${scenes[0]?.heading ?? ''}`.slice(0, 100)} defaultDescription={[...scenes.map((scene) => scene.voice), site?.url ?? ''].filter(Boolean).join(NEWLINE)} vertical={f.h > f.w} seconds={result.seconds} />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
