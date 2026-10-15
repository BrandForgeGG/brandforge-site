'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getSessionUser } from '@/lib/browser-auth';
import { trackEvent } from '@/lib/funnel-client';
import { useLogin } from '@/components/login-dialog';
import { fitToVoice, totalSeconds } from '@/lib/video-scenes.js';
import type { LaunchScene } from '@/lib/launch-video.js';
import { canEncode, encodeFrames } from '@/components/video/video-engine';
import { drawLaunchFrame, loadLaunchFonts, type LaunchLook, type LaunchMedia } from '@/components/video/launch-engine';
import { VOICES, audioContext, clipsFor, layTrack, playClips, type Clip, type VoiceId, warmVoice } from '@/components/video/voice';
import { MUSIC_STYLES, beatSeconds, mixWithMusic, playBed, type MusicStyle } from '@/components/video/music';
import { drawKineticFrame, launchToKinetic, loadKineticFonts } from '@/components/video/kinetic-engine';
import { TONE_IDS, type LaunchShare, type LaunchTone } from '@/lib/launch-video.js';
import { YouTubePost } from '@/components/video/youtube-post';
import { LaunchProgress } from '@/components/video/launch-progress';
import { posterOf } from '@/components/drafts/drafts-store';
import { postVideoToChat, type ChatTarget } from '@/components/chat/post-creation';
import { useAutosave, useDraft } from '@/components/drafts/use-draft';
import { sampleReference } from '@/components/video/reference-video';
import { paceLabel, type ReferenceFormat } from '@/lib/reference-format.js';

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
type LaunchState = { url: string; about: string; shape: Shape; withVoice: boolean; voice: VoiceId; scenes: LaunchScene[]; site: SiteInfo | null; look: LaunchLook; tone?: LaunchTone; music?: MusicStyle; share?: LaunchShare | null; reference?: Reference | null; motion?: Motion };

/** How the video moves: calm scenes, or Kinetic motion design that cuts on the beat. */
type Motion = 'clean' | 'kinetic';
const MOTIONS: { id: Motion; label: string; note: string }[] = [
  { id: 'kinetic', label: 'Kinetic', note: 'big words cut on the beat' },
  { id: 'clean', label: 'Clean', note: 'calm scenes' },
];

/** A video the member likes, as the format to follow ("Make one like this"). */
type Reference = { name: string; format: ReferenceFormat };

const TONE_LABEL: Record<LaunchTone, string> = { bold: 'Bold', calm: 'Calm', playful: 'Playful', premium: 'Premium' };
const HOOK_LABEL: Record<string, string> = { result: 'result-first hook', problem: 'pain-first hook', question: 'question hook', claim: 'bold-claim hook', demo: 'demo hook', story: 'story hook' };

function slugOf(name: string): string {
  return (name || 'launch').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'launch';
}

/** The value, or null if it takes longer than ms. */
function within<T>(promise: Promise<T | null>, ms: number): Promise<T | null> {
  return Promise.race([promise, new Promise<null>((resolve) => window.setTimeout(() => resolve(null), ms))]);
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
  // What is still on its way, for the waiting screen: the site's pictures, its screenshot, and when writing began.
  const [picturesState, setPicturesState] = useState<'idle' | 'loading' | 'done'>('idle');
  const [shotState, setShotState] = useState<'idle' | 'loading' | 'done' | 'none'>('idle');
  const [writeStarted, setWriteStarted] = useState<number | null>(null);
  // The setup (site, words, shape, voice) folds away once the story is written; it opens again with Change.
  const [editingSetup, setEditingSetup] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [withVoice, setWithVoice] = useState(true);
  const [voice, setVoice] = useState<VoiceId>('af_heart');
  // How it sounds and reads: the tone the story is written in, the music under it, and the post that goes with it.
  const [tone, setTone] = useState<LaunchTone>('bold');
  const [music, setMusic] = useState<MusicStyle>('upbeat');
  const [motion, setMotion] = useState<Motion>('kinetic');
  const [share, setShare] = useState<LaunchShare | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  // "Make one like this": the format of a video the member likes, and what the study of it is doing right now.
  const [reference, setReference] = useState<Reference | null>(null);
  const [referenceStep, setReferenceStep] = useState<string | null>(null);
  const referenceInput = useRef<HTMLInputElement>(null);
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
  // One function draws any frame in the chosen look, for the preview and the MP4 alike.
  const kinetic = useMemo(() => (motion === 'kinetic' ? launchToKinetic(timed, media) : null), [motion, timed, media]);
  const drawAt = useMemo(
    () => (ctx: CanvasRenderingContext2D, t: number) =>
      kinetic ? drawKineticFrame(ctx, f.w, f.h, kinetic, t, look, { name: media.name, host: media.host }, beatSeconds(music)) : drawLaunchFrame(ctx, f.w, f.h, timed, t, look, media),
    [kinetic, f.w, f.h, look, media, music, timed]
  );
  const writing = busy === 'writing';
  const written = scenes.length > 0;
  // The preview opens once the story, the pictures and the voice are in; the screenshot is allowed to arrive later.
  const assetsReady = written && !writing && picturesState !== 'loading' && (!withVoice || voiceState.status === 'ready' || voiceState.status === 'failed');

  useEffect(() => {
    void Promise.all([loadLaunchFonts(), loadKineticFonts()]).then(() => setFontsReady(true));
  }, []);

  // The voice model starts downloading as soon as the maker opens with the voice on, so it is ready when the words are.
  useEffect(() => {
    if (withVoice) warmVoice();
  }, [withVoice]);

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
        if (s.tone) setTone(s.tone);
        if (s.music) setMusic(s.music);
        setMotion(s.motion ?? 'clean');
        setShare(s.share ?? null);
        setReference(s.reference ?? null);
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
  const draftState: LaunchState = { url, about, shape, withVoice, voice, scenes, site, look, tone, music, share, reference, motion };
  useAutosave({ draftState, made: Boolean(result) }, scenes.length > 0, () =>
    void draft.save({ title: scenes[0]?.heading || site?.name || 'Launch video', state: draftState, ...(result ? {} : { video: undefined, poster: undefined, seconds: undefined }) })
  );

  // The site's pictures, then a screenshot of it, loaded once the story is written. The pictures come first (a few
  // seconds); the screenshot can take longer and never holds anything up: the tour shows a site picture until it lands.
  useEffect(() => {
    if (!site) return;
    let live = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the pictures follow the site that was read
    setMedia({ name: site.name, host: site.host, shot: null, pictures: [] });
    setPicturesState('loading');
    setShotState('loading');
    void Promise.all(site.pictures.map(async (picture) => ({ image: await within(bitmap(picture.src), 12_000), label: picture.label }))).then((pictures) => {
      if (!live) return;
      const usable = pictures.filter((p): p is { image: ImageBitmap; label: string } => Boolean(p.image && p.image.width >= 200 && p.image.height >= 120));
      setMedia((current) => ({ ...current, pictures: usable }));
      setPicturesState('done');
      // Without real pictures there is nothing to show in the proof scene.
      if (usable.length < 2) setScenes((current) => current.filter((scene) => scene.kind !== 'proof'));
    });
    void within(bitmap(site.shot), 45_000).then((shot) => {
      if (!live) return;
      setMedia((current) => ({ ...current, shot }));
      setShotState(shot ? 'done' : 'none');
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
      void clipsFor(scenes.map((scene) => scene.voice), voice, (done, total, note) => live && setVoiceState({ status: 'working', text: note ?? `Recording the voice-over, ${done} of ${total}…` }))
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
      drawAt(ctx, kinetic ? 0 : Math.min(2.4, timed[0].seconds - 0.4));
      return;
    }
    const stopVoice = voiced && clips ? playClips(clips, startsOf(timed)) : () => undefined;
    const stopMusic = playBed(audioContext(), seconds, music);
    const start = performance.now() + 50;
    let frame = 0;
    const tick = () => {
      const t = Math.max(0, (performance.now() - start) / 1000);
      if (t >= seconds) {
        setPlaying(false);
        return;
      }
      drawAt(ctx, t);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      stopVoice();
      stopMusic();
    };
  }, [timed, playing, fontsReady, f.w, f.h, seconds, voiced, clips, assetsReady, music, drawAt, kinetic]);

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
    setBusy('writing');
    setWriteStarted(Date.now());
    try {
      const res = await fetch('/api/create/launch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: url.trim(), about: about.trim(), tone, format: reference?.format ?? null }) });
      const data = (await res.json().catch(() => ({}))) as { site?: SiteInfo | null; scenes?: LaunchScene[]; share?: LaunchShare; error?: string };
      if (!res.ok || !data.scenes) throw new Error(data.error || 'The writer could not make the story. Try again.');
      setScenes(data.scenes);
      setShare(data.share ?? null);
      setSite(data.site ?? null);
      setLook(data.site?.colors ?? DEFAULT_LOOK);
      if (!data.site) setMedia({ name: '', host: '', shot: null, pictures: [] });
      setResult(null);
      setEditingSetup(false);
      if (!data.site) {
        setPicturesState('done');
        setShotState('none');
      }
      trackEvent('create_interest', { status: 'video-launch' });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The writer could not make the story.');
    } finally {
      setBusy(null);
      setWriteStarted(null);
    }
  }

  // Studies a video the member likes: measured here, then a short sound track and five frames go to be listened to and
  // looked at. What comes back is its format; its tone and shape become the starting choices, and the member can change them.
  async function studyReference(file: File) {
    setError(null);
    setReferenceStep('Opening the video…');
    try {
      const sample = await sampleReference(file, setReferenceStep);
      setReferenceStep('Learning its format…');
      const form = new FormData();
      form.append('measured', JSON.stringify(sample.measured));
      sample.frames.forEach((frame, i) => form.append('frames', frame, `frame-${i}.jpg`));
      if (sample.audio) form.append('audio', sample.audio, 'sound.wav');
      const res = await fetch('/api/create/launch/reference', { method: 'POST', body: form });
      const data = (await res.json().catch(() => ({}))) as { format?: ReferenceFormat | null; error?: string };
      if (!res.ok || !data.format) throw new Error(data.error || 'That video could not be studied. Try another one.');
      setReference({ name: file.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 60) || 'your video', format: data.format });
      if (data.format.tone) setTone(data.format.tone);
      setShape(sample.tall ? 'tall' : 'wide');
      setResult(null);
      trackEvent('create_interest', { status: 'video-launch-reference' });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That video could not be studied. Try another one.');
    } finally {
      setReferenceStep(null);
      if (referenceInput.current) referenceInput.current.value = '';
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
      // The voice-over (if any) over the music bed, the music ducked under the words.
      const track = mixWithMusic(voiced && clips ? layTrack(clips, startsOf(timed), seconds) : null, seconds, music);
      setBusy('Making the video…');
      setProgress(0);
      const blob = await encodeFrames({ w: f.w, h: f.h, seconds, draw: drawAt, voice: track, onProgress: setProgress, signal: controller.signal });
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

  const showSetup = !written || editingSetup;
  const voiceLabel = VOICES.find((option) => option.id === voice)?.label ?? 'Voice';
  const tall = f.h > f.w;
  const making = busy === 'Making the video…' || busy === 'Saving it to the chat…';

  return (
    <div className="space-y-4">
      {showSetup ? (
        <section aria-label="What are you launching" className="rounded-2xl border border-line bg-panel p-4 sm:p-5">
          <label htmlFor="launch-url" className="font-serif text-lg text-foreground">Your website</label>
          <input id="launch-url" value={url} onChange={(event) => setUrl(event.target.value)} inputMode="url" maxLength={300} placeholder="yourproduct.com" className={`${field} mt-2 text-base`} />
          <label htmlFor="launch-about" className="mt-3 block text-sm text-foreground">Anything to add <span className="text-muted">(optional, or use this alone if you have no site yet)</span></label>
          <textarea id="launch-about" value={about} onChange={(event) => setAbout(event.target.value)} rows={2} maxLength={1200} placeholder="Who it is for, what is new, the one thing people should remember." className={`${field} mt-1.5`} />
          <div className="mt-3 rounded-xl border border-dashed border-line px-3 py-2.5">
            <input ref={referenceInput} type="file" accept="video/*" className="sr-only" id="launch-reference" onChange={(event) => { const file = event.target.files?.[0]; if (file) void studyReference(file); }} />
            {referenceStep ? (
              <p className="flex items-center gap-2 text-sm text-foreground" aria-live="polite">
                <span className="h-2 w-2 animate-pulse rounded-full bg-ember" aria-hidden="true" />
                {referenceStep}
              </p>
            ) : reference ? (
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">Made like “{reference.name}”</p>
                  <p className="mt-0.5 text-xs text-muted">{reference.format.summary}</p>
                  {reference.format.hookStyle ? (
                  <p className="mt-1 text-xs text-muted">
                    {Math.round(reference.format.seconds)}s · {paceLabel(reference.format.avgShot)}
                    {reference.format.hookStyle ? ` · ${HOOK_LABEL[reference.format.hookStyle]}` : ''}
                    {reference.format.beats.length ? ` · ${reference.format.beats.length} beats` : ''}
                  </p>
                  ) : null}
                </div>
                <label htmlFor="launch-reference" className="shrink-0 cursor-pointer text-xs text-muted hover:text-foreground">Swap</label>
                <button type="button" onClick={() => { setReference(null); setResult(null); }} className="shrink-0 text-xs text-muted hover:text-foreground">Remove</button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <label htmlFor="launch-reference" className="cursor-pointer text-sm font-semibold text-foreground underline-offset-2 hover:underline">Make one like this</label>
                <span className="text-xs text-muted">Optional. Pick a launch video you like; yours follows its hook, pace and order, in your own words.</span>
              </div>
            )}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2" role="group" aria-label="Shape">
            {(Object.keys(SHAPES) as Shape[]).map((id) => (
              <button key={id} type="button" aria-pressed={shape === id} onClick={() => { setShape(id); setResult(null); }} className={`${chip} ${shape === id ? 'border-ember bg-ember/10 text-foreground' : 'border-line text-muted hover:text-foreground'}`}>
                {SHAPES[id].label} <span className="hidden text-muted sm:inline">· {SHAPES[id].note}</span>
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5" role="group" aria-label="Voice">
            <button type="button" aria-pressed={!withVoice} onClick={() => { setWithVoice(false); setResult(null); setPlaying(false); }} className={`${chip} ${!withVoice ? 'border-ember bg-ember/10 text-foreground' : 'border-line text-muted hover:text-foreground'}`}>
              No voice
            </button>
            {VOICES.map((option) => (
              <button key={option.id} type="button" aria-pressed={withVoice && voice === option.id} onClick={() => { setWithVoice(true); setVoice(option.id); setResult(null); setPlaying(false); }} className={`${chip} ${withVoice && voice === option.id ? 'border-ember bg-ember/10 text-foreground' : 'border-line text-muted hover:text-foreground'}`}>
                {option.label}
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5" role="group" aria-label="Look">
            {MOTIONS.map((option) => (
              <button key={option.id} type="button" aria-pressed={motion === option.id} onClick={() => { setMotion(option.id); if (option.id === 'kinetic' && music === 'warm') setMusic('upbeat'); setResult(null); setPlaying(false); }} className={`${chip} ${motion === option.id ? 'border-ember bg-ember/10 text-foreground' : 'border-line text-muted hover:text-foreground'}`}>
                {option.label} <span className="hidden text-muted sm:inline">· {option.note}</span>
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5" role="group" aria-label="Tone">
            {TONE_IDS.map((id) => (
              <button key={id} type="button" aria-pressed={tone === id} onClick={() => setTone(id)} className={`${chip} ${tone === id ? 'border-ember bg-ember/10 text-foreground' : 'border-line text-muted hover:text-foreground'}`}>
                {TONE_LABEL[id]}
              </button>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-1.5" role="group" aria-label="Music">
            {MUSIC_STYLES.map((option) => (
              <button key={option.id} type="button" aria-pressed={music === option.id} onClick={() => { setMusic(option.id); setResult(null); setPlaying(false); }} className={`${chip} ${music === option.id ? 'border-ember bg-ember/10 text-foreground' : 'border-line text-muted hover:text-foreground'}`}>
                {option.label}
              </button>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void write()} disabled={Boolean(busy) || Boolean(referenceStep)} className="w-full rounded-xl bg-ember px-5 py-2.5 text-sm font-semibold text-on-ember transition hover:opacity-90 disabled:opacity-60 sm:w-auto">
              {writing ? 'Writing…' : written ? 'Write it again' : 'Write the launch video'}
            </button>
            {written && !writing ? (
              <button type="button" onClick={() => setEditingSetup(false)} className="px-3 py-2 text-sm text-muted hover:text-foreground">Keep this one</button>
            ) : null}
          </div>
          <p className="mt-2 text-xs text-muted">Written only from what your site says. Check every line before you post it.{reference ? ' The video you picked stays on your device: only its sound and five frames are studied, then dropped.' : ''}</p>
          {error ? <p role="alert" className="mt-2 text-sm text-danger">{error}</p> : null}
        </section>
      ) : (
        <div className="flex items-center gap-3 rounded-2xl border border-line bg-panel px-4 py-3">
          <span className="flex shrink-0 -space-x-1.5" aria-hidden="true">
            {[look.bg, look.text, look.accent].map((color, i) => (
              <span key={i} className="h-5 w-5 rounded-full border-2 border-panel" style={{ background: color }} />
            ))}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">{site?.host || about.slice(0, 60) || 'Your launch'}</p>
            <p className="truncate text-xs text-muted">
              {SHAPES[shape].label} · {motion === 'kinetic' ? 'Kinetic' : 'Clean'} · {withVoice ? voiceLabel : 'No voice'} · {timed.length} scenes · {Math.round(seconds)}s{reference ? ` · like “${reference.name}”` : ''}
            </p>
          </div>
          <button type="button" onClick={() => setEditingSetup(true)} className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-xs text-foreground transition hover:border-ember">Change</button>
        </div>
      )}

      {writing || (written && !assetsReady) ? (
        <LaunchProgress look={look} host={site?.host ?? (url.trim() ? url.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '') : '')} scenes={scenes} writing={writing} writeStarted={writeStarted} picturesState={picturesState} shotState={shotState} withVoice={withVoice} voiceState={voiceState} tall={tall} />
      ) : null}

      {assetsReady ? (
        <div className="bf-rise space-y-4">
          <div className="relative overflow-hidden rounded-3xl border border-line bg-[#0b0b0c]">
            <canvas ref={canvasRef} className={tall ? 'mx-auto block h-[min(70vh,640px)] w-auto' : 'block h-auto w-full'} style={{ aspectRatio: `${f.w} / ${f.h}` }} />
            {playing ? (
              <button type="button" onClick={() => setPlaying(false)} className="absolute bottom-3 right-3 rounded-full bg-black/60 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm transition hover:bg-black/75">
                Stop
              </button>
            ) : (
              <button type="button" onClick={() => setPlaying(true)} aria-label={voiced ? 'Play the preview with voice' : 'Play the preview'} className="group absolute inset-0 flex items-center justify-center">
                <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white/90 shadow-xl transition group-hover:scale-105 sm:h-20 sm:w-20">
                  <svg viewBox="0 0 20 20" className="h-6 w-6 translate-x-0.5 fill-[#1d1b18] sm:h-7 sm:w-7" aria-hidden="true"><path d="M6 3.5v13l11-6.5z" /></svg>
                </span>
              </button>
            )}
          </div>
          {shotState === 'loading' ? <p className="text-xs text-muted">The picture of your site is still on its way; the preview updates when it lands.</p> : null}
          {withVoice && voiceState.status === 'failed' ? <p role="alert" className="text-xs text-danger">{voiceState.text}</p> : null}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <button type="button" onClick={() => void make()} disabled={Boolean(busy) || !fontsReady || (withVoice && voiceState.status === 'working')} className="w-full rounded-xl bg-ember px-6 py-3 text-sm font-semibold text-on-ember transition hover:opacity-90 disabled:opacity-60 sm:w-auto">
              {busy === 'Making the video…' ? `Making the video, ${Math.round(progress * 100)}%` : busy === 'Saving it to the chat…' ? 'Saving it to the chat…' : chat ? 'Make the video' : 'Make the MP4'}
            </button>
            {making ? <button type="button" onClick={() => stopRef.current?.abort()} className="px-2 py-2 text-xs text-muted hover:text-foreground">Stop</button> : null}
            {chat && !making ? <p className="text-xs text-muted">It lands in this chat as a new version you can post or share.</p> : null}
          </div>
          {making ? (
            <div className="h-1.5 overflow-hidden rounded-full bg-overlay" aria-hidden="true">
              <div className="h-full rounded-full bg-ember transition-[width] duration-300" style={{ width: `${Math.max(4, progress * 100)}%` }} />
            </div>
          ) : null}
          {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}

          {share && (share.caption || share.linkedin) ? (
            <div className="rounded-2xl border border-line bg-panel p-4">
              <p className="text-sm font-semibold text-foreground">The post that goes with it</p>
              {[
                { id: 'caption', label: 'Short caption', text: share.caption },
                { id: 'linkedin', label: 'LinkedIn', text: share.linkedin },
              ]
                .filter((entry) => entry.text)
                .map((entry) => (
                  <div key={entry.id} className="mt-3">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{entry.label}</p>
                      <button type="button" onClick={() => void navigator.clipboard?.writeText(entry.text).then(() => { setCopied(entry.id); window.setTimeout(() => setCopied(null), 1500); })} className="text-xs text-ember hover:underline">
                        {copied === entry.id ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-foreground">{entry.text}</p>
                  </div>
                ))}
            </div>
          ) : null}

          <details className="group rounded-2xl border border-line bg-panel">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm text-foreground">
              <span>
                Script <span className="text-muted">· {timed.length} scenes · edit any words</span>
              </span>
              <span className="text-muted transition group-open:rotate-180" aria-hidden="true">▾</span>
            </summary>
            <ol className="space-y-2 border-t border-line p-3">
              {timed.map((scene, i) => (
                <li key={`${scene.kind}-${i}`} className="rounded-xl bg-background p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{KIND_LABEL[scene.kind]} · {scene.seconds}s</p>
                  <input value={scenes[i].heading} onChange={(event) => editScene(i, { heading: event.target.value.slice(0, 70) })} aria-label={`${KIND_LABEL[scene.kind]} words on screen`} className={`${field} mt-1.5`} />
                  <textarea value={scenes[i].voice} onChange={(event) => editScene(i, { voice: event.target.value.replace(new RegExp(NEWLINE, 'g'), ' ').slice(0, 220) })} rows={2} aria-label={`${KIND_LABEL[scene.kind]} spoken words`} className={`${field} mt-1.5 text-[13px]`} />
                </li>
              ))}
            </ol>
          </details>

          <details className="group rounded-2xl border border-line bg-panel">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm text-foreground">
              <span>
                Colours <span className="text-muted">· from your site</span>
              </span>
              <span className="text-muted transition group-open:rotate-180" aria-hidden="true">▾</span>
            </summary>
            <div className="flex flex-wrap items-center gap-3 border-t border-line p-4" role="group" aria-label="Colours">
              {colorInput('bg', 'Ground')}
              {colorInput('text', 'Words')}
              {colorInput('accent', 'Accent')}
              {site ? <button type="button" onClick={() => setLook(site.colors)} className="text-xs text-muted underline-offset-2 hover:text-foreground hover:underline">Use the site&apos;s colours</button> : null}
            </div>
          </details>

          {result ? (
            <div className="rounded-2xl border border-trust/30 bg-trust/10 p-4">
              <p className="text-sm text-foreground">Your launch video is ready: {Math.round(result.seconds)} seconds{result.voiced ? ', with voice-over' : ''}.</p>
              <video src={result.url} controls playsInline className="mt-2 max-h-72 w-auto max-w-full rounded-lg" />
              <a href={result.url} download={result.name} className="mt-2 inline-block rounded-lg bg-ember px-4 py-2 text-sm font-semibold text-on-ember transition hover:opacity-90">Download MP4</a>
              <YouTubePost blob={result.blob} defaultTitle={`${media.name ? `${media.name}: ` : ''}${scenes[0]?.heading ?? ''}`.slice(0, 100)} defaultDescription={[share?.caption || scenes.map((scene) => scene.voice).join(' '), site?.url ?? ''].filter(Boolean).join(NEWLINE)} vertical={tall} seconds={result.seconds} />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
