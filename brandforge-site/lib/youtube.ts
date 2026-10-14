import type { CarouselChannelRow } from '@/lib/project-db';
import { oauthAccessToken } from '@/lib/oauth-channels';
import type { PublishResult } from '@/lib/carousel-publish';

// Sends a finished video to a linked YouTube channel. A vertical video under three minutes shows as a Short. With a time,
// it goes up now and YouTube itself publishes it then (publishAt), so a scheduled video needs nothing from us later.
// Note: YouTube keeps every video uploaded through an app that has not passed its API audit as private. Once the app is
// audited, the same code publishes publicly.
export type VideoUpload = { bytes: Buffer; title: string; description: string; publishAt?: string | null; vertical: boolean; seconds: number };

function shortsTitle(title: string, vertical: boolean, seconds: number): string {
  const clean = title.replace(/\s+/g, ' ').trim().slice(0, 90) || 'New video';
  return vertical && seconds <= 180 && !/#shorts/i.test(clean) ? `${clean} #Shorts`.slice(0, 100) : clean.slice(0, 100);
}

export async function uploadToYouTube(channel: CarouselChannelRow, video: VideoUpload): Promise<PublishResult> {
  const token = await oauthAccessToken('youtube', channel);
  if (!token) return { ok: false, note: 'YouTube needs you to connect again.' };
  const publishAt = video.publishAt && new Date(video.publishAt).getTime() > Date.now() + 60_000 ? new Date(video.publishAt).toISOString() : null;
  const metadata = {
    snippet: { title: shortsTitle(video.title, video.vertical, video.seconds), description: video.description.slice(0, 4900), categoryId: '22' },
    status: { privacyStatus: publishAt ? 'private' : 'public', ...(publishAt ? { publishAt } : {}), selfDeclaredMadeForKids: false },
  };
  try {
    // A resumable upload: one request opens the session, the next sends the file.
    const open = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': 'video/mp4', 'X-Upload-Content-Length': String(video.bytes.length) },
      body: JSON.stringify(metadata),
      signal: AbortSignal.timeout(20000),
    });
    const session = open.headers.get('location');
    if (!open.ok || !session) {
      const detail = (await open.text().catch(() => '')).slice(0, 300);
      console.error('[youtube] upload session failed:', open.status, detail);
      if (/quotaExceeded/i.test(detail)) return { ok: false, note: 'YouTube says the daily upload allowance is used up. Try again tomorrow.' };
      if (open.status === 401) return { ok: false, note: 'YouTube needs you to connect again.' };
      return { ok: false, note: `YouTube said: ${open.status}` };
    }
    const sent = await fetch(session, { method: 'PUT', headers: { 'Content-Type': 'video/mp4', 'Content-Length': String(video.bytes.length) }, body: new Uint8Array(video.bytes), signal: AbortSignal.timeout(50000) });
    const made = (await sent.json().catch(() => ({}))) as { id?: string; status?: { privacyStatus?: string } };
    if (!sent.ok || !made.id) {
      console.error('[youtube] upload failed:', sent.status, JSON.stringify(made).slice(0, 300));
      return { ok: false, note: `YouTube refused the video (${sent.status}).` };
    }
    const url = video.vertical && video.seconds <= 180 ? `https://www.youtube.com/shorts/${made.id}` : `https://www.youtube.com/watch?v=${made.id}`;
    const privateNote = !publishAt && made.status?.privacyStatus === 'private' ? ' YouTube kept it private: the app has not passed YouTube’s API audit yet.' : '';
    return { ok: true, url, ...(privateNote ? { note: privateNote.trim() } : {}) };
  } catch (cause) {
    console.error('[youtube] upload threw:', cause instanceof Error ? cause.message : cause);
    return { ok: false, note: 'Could not reach YouTube.' };
  }
}
