'use client';

import { useState } from 'react';
import { fetchAuthed, getSessionUser } from '@/lib/browser-auth';
import { trackEvent } from '@/lib/funnel-client';
import { useLogin } from '@/components/login-dialog';
import { extensionOf, fitForUpload } from '@/components/community/fit-for-upload';

export const COMMUNITY_SHARED = 'bf:community-shared';

// "Share to the community": puts one finished creation in the public feed on Create or Distribute. Only what someone shares
// on purpose is shown to others. Guests are asked to sign in first; the work stays where it is.
export function ShareButton({ kind, format, title, caption, getImages, className }: { kind: 'create' | 'distribute'; format: string; title: string; caption?: string; getImages: () => Promise<Blob[]>; className?: string }) {
  const { openLogin } = useLogin();
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');
  const [error, setError] = useState('');

  async function share() {
    if (state === 'busy') return;
    setError('');
    if (!(await getSessionUser().catch(() => null))) {
      openLogin({ reason: 'signin', next: window.location.pathname + window.location.search });
      return;
    }
    setState('busy');
    try {
      const images = await fitForUpload((await getImages()).slice(0, 10));
      if (images.length === 0) throw new Error('There is no picture to share yet.');
      const body = new FormData();
      body.append('kind', kind);
      body.append('format', format);
      body.append('title', title.slice(0, 120));
      body.append('caption', (caption ?? '').slice(0, 2200));
      images.forEach((blob, i) => body.append(`image${i}`, blob, `${i + 1}.${extensionOf(blob)}`));
      const res = await fetchAuthed('/api/community', { method: 'POST', body });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || (res.status === 413 ? 'Those pictures are too big to send. Try again with fewer slides.' : `Could not share that (${res.status}). Try again.`));
      setState('done');
      trackEvent('community_shared', { source: kind });
      window.dispatchEvent(new CustomEvent(COMMUNITY_SHARED, { detail: kind }));
    } catch (cause) {
      setState('idle');
      setError(cause instanceof Error ? cause.message : 'Could not share that.');
    }
  }

  return (
    <span className="inline-flex flex-col">
      <button type="button" onClick={() => void share()} disabled={state !== 'idle'} className={className ?? 'rounded-lg border border-line px-3 py-1.5 text-xs text-foreground transition hover:border-ember disabled:opacity-60'}>
        {state === 'busy' ? 'Sharing…' : state === 'done' ? 'Shared to the community' : 'Share to the community'}
      </button>
      {error ? <span role="alert" className="mt-1 text-xs text-danger">{error}</span> : null}
    </span>
  );
}
