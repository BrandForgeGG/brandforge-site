"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

import * as PresenceUtils from "@/lib/presence-utils";

const { shapePresenceState, shapeTypingState } = PresenceUtils;

export interface ConversationPresence {
  /** Display name -> staff flag, for everyone else currently in this conversation. */
  viewers: { name: string; staff: boolean }[];
  /** Display names of the others who are typing right now (self is excluded upstream). */
  typing: string[];
  /** False until the first presence sync arrives, so callers can avoid a false "alone". */
  live: boolean;
}

const EMPTY: ConversationPresence = { viewers: [], typing: [], live: false };

// Per-conversation presence + typing, on the same Realtime channel that carries live messages.
//
// The server is still the source of truth for the transcript: this only *pushes* rows the user
// is already authorised to read (RLS applies to the payload), so it improves latency without
// becoming a second copy of chat state. If the channel fails to subscribe we fall back to the
// existing polling path, so nothing breaks when Realtime is unavailable.
export function useConversationPresence(
  conversationId: string,
  self: { userId: string; name: string; staff: boolean } | null,
  typing: boolean,
): ConversationPresence {
  const [presence, setPresence] = useState<ConversationPresence>(EMPTY);

  const userId = self?.userId ?? "";
  const name = self?.name ?? "";
  const staff = self?.staff ?? false;
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const identityRef = useRef({ name, staff });

  useEffect(() => {
    identityRef.current = { name, staff };
  }, [name, staff]);

  useEffect(() => {
    if (!conversationId || !userId) {
      return;
    }

    const channel = supabase.channel(`conversation:${conversationId}`);
    channelRef.current = channel;

    function publish() {
      const raw = channel.presenceState();
      const current = identityRef.current;
      setPresence({
        viewers: shapePresenceState(raw, {
          userId,
          name: current.name,
          staff: current.staff,
        }),
        typing: shapeTypingState(raw, userId),
        live: true,
      });
    }

    channel
      .on("presence", { event: "sync" }, publish)
      .on("presence", { event: "join" }, publish)
      .on("presence", { event: "leave" }, publish)
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          const current = identityRef.current;
          void channel.track({ ...current, userId, typing: false });
        }
      });

    return () => {
      if (channelRef.current === channel) channelRef.current = null;
      void supabase.removeChannel(channel);
    };
  }, [conversationId, userId]);

  useEffect(() => {
    if (!channelRef.current) return;
    void channelRef.current.track({ ...identityRef.current, userId, typing });
  }, [typing, userId]);

  return presence;
}

// Platform-wide "who is online" counters were removed with the Workspace UX 2.0 sidebar cleanup
// (2026-09-26): they measured nothing a founder could act on. Per-conversation presence above still
// drives the typing indicator and the "who else is here" label, which are both actionable.
