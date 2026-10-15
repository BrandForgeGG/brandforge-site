'use client';

import { fetchAuthed } from '@/lib/browser-auth';
import { supabase } from '@/lib/supabase';
import type { VideoMakerId } from '@/lib/video-embed.js';

/** Where a maker running inside a chat sends what it made. */
export type ChatTarget = { conversationId: string; initialState?: unknown; onPosted: () => void };

async function blobToJpegDataUrl(blob: Blob | null): Promise<string | null> {
  if (!blob) return null;
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' && reader.result.startsWith('data:image/jpeg') ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

async function post(conversationId: string, body: Record<string, unknown>): Promise<string> {
  const res = await fetchAuthed(`/api/conversations/${conversationId}/creation`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as { messageId?: string; error?: string };
  if (!res.ok || !data.messageId) throw new Error(data.error || 'Could not add it to the chat. Try again.');
  return data.messageId;
}

/** A finished video into its chat: the file goes to the person's kept storage, then the chat gets a message for it. */
export async function postVideoToChat(conversationId: string, input: { blob: Blob; poster: Blob | null; maker: VideoMakerId; title: string; state: unknown; seconds: number; vertical: boolean }): Promise<string> {
  const slot = await fetchAuthed('/api/video/upload-url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ keep: true }) });
  const slotData = (await slot.json().catch(() => ({}))) as { path?: string; token?: string; error?: string };
  if (!slot.ok || !slotData.path || !slotData.token) throw new Error(slotData.error || 'Could not prepare the upload.');
  const { error } = await supabase.storage.from('videos').uploadToSignedUrl(slotData.path, slotData.token, input.blob, { contentType: 'video/mp4' });
  if (error) throw new Error('The video did not upload. Check your connection and try again.');
  return post(conversationId, {
    creation: 'video',
    maker: input.maker,
    title: input.title,
    state: input.state,
    seconds: input.seconds,
    vertical: input.vertical,
    videoPath: slotData.path,
    coverDataUrl: await blobToJpegDataUrl(input.poster),
  });
}

/** A written article into its chat. */
export async function postArticleToChat(conversationId: string, fields: Record<string, unknown>): Promise<string> {
  return post(conversationId, { creation: 'article', ...fields });
}
