// Live transcript delivery over Supabase Realtime.
//
// The transcript is still owned by the server: this hook only *pushes* rows the viewer is
// already authorised to read (RLS applies to realtime payloads), so a staff reply lands without
// a refresh. Callers keep their polling fallback, so a Realtime outage degrades to "slightly
// slower" rather than "broken".
'use client';

import { useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

export interface LiveMessageRow {
  id: string;
  sender_type: string;
  content: string;
  content_type: string | null;
  created_at: string | null;
  edited_at?: string | null;
  sender_id?: string | null;
  sender_name?: string | null;
  artifact_data?: Record<string, unknown> | null;
}

// Returns nothing: the caller passes an `onMessage` that decides whether an arriving row is new.
// Re-subscription on conversation change is deliberate — the channel name is per-conversation.
export function useRealtimeMessages(
  conversationId: string,
  onMessage: (row: LiveMessageRow) => void,
  onChange?: (event: 'updated' | 'deleted', row: LiveMessageRow) => void
): void {
  // Keep the latest callback without tearing the channel down on every render.
  const latest = useRef(onMessage);
  const latestChange = useRef(onChange);

  useEffect(() => { latest.current = onMessage; }, [onMessage]);
  useEffect(() => { latestChange.current = onChange; }, [onChange]);

  useEffect(() => {
    if (!conversationId) {
      return;
    }

    const channel = supabase
      .channel(`messages:conversation:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const record = payload.new as Partial<LiveMessageRow> | null;
          if (!record?.id) {
            return;
          }

          latest.current({
            id: String(record.id),
            sender_type: String(record.sender_type ?? 'ai'),
            content: String(record.content ?? ''),
            content_type: record.content_type ? String(record.content_type) : null,
            created_at: record.created_at ? String(record.created_at) : null,
            sender_id: record.sender_id ? String(record.sender_id) : null,
            sender_name: record.sender_name ? String(record.sender_name) : null,
            artifact_data: record.artifact_data && typeof record.artifact_data === 'object' ? (record.artifact_data as Record<string, unknown>) : null,
          });
        }
      )
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, (payload) => {
        const record = payload.new as Partial<LiveMessageRow>;
        if (record?.id) latestChange.current?.('updated', record as LiveMessageRow);
      })
      .on('postgres_changes', {
        event: 'DELETE', schema: 'public', table: 'messages',
        filter: `conversation_id=eq.${conversationId}`,
      }, (payload) => {
        const record = payload.old as Partial<LiveMessageRow>;
        if (record?.id) latestChange.current?.('deleted', record as LiveMessageRow);
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversationId]);
}
