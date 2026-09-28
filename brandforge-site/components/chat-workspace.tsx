"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRealtimeMessages } from "@/lib/realtime-messages";
import { useConversationPresence } from "@/lib/presence";
import { formatTypingLabel } from "@/lib/presence-utils";
import { avatarTone, formatRole, initialsFor } from "@/lib/identity-display";
import { useRouter, useSearchParams } from "next/navigation";
import type { ClientProjectState } from "@/lib/conversation-state";
import {
  insertComposerCommand,
  parseChatEmbed,
  parseSlashCommand,
  validateAttachment,
  validateMessageInput,
} from "@/lib/message-actions";
import { summarizeTaskProgress } from "@/lib/task-board";
import { shapeTaskRoster } from "@/lib/task-board";
import { isNearBottom } from "@/lib/chat-scroll";
import { fetchAuthed } from "@/lib/browser-auth";
import { BetaBanner } from "@/components/beta-banner";
import { ChatTranscript, type ChatMessage } from "@/components/chat-transcript";
import {
  ConversationRail,
  relativeTime,
  type RecentConversation,
} from "@/components/conversation-rail";
import {
  ProjectContextPanel,
  STATUS_LABELS,
  type AgreementSummary,
  type PaymentSummary,
  type ProposalSummary,
  type TaskParticipant,
} from "@/components/project-context-panel";

interface PersistedMessage {
  id: string;
  sender_type: string;
  sender_name?: string | null;
  content: string;
  content_type: string | null;
  artifact_data?: Record<string, unknown> | null;
  sender_id?: string | null;
  edited_at?: string | null;
  deleted_at?: string | null;
  reactions?: { emoji: string; count: number; reactedByMe: boolean }[];
  created_at: string | null;
}

function toChatMessage(message: PersistedMessage): ChatMessage {
  const sender: ChatMessage["sender"] =
    message.sender_type === "user"
      ? "user"
      : message.sender_type === "ai"
        ? message.content_type === "system"
          ? "system"
          : "ai"
        : "human";

  return {
    id: message.id,
    sender,
    content: message.content,
    createdAt: message.created_at,
    senderName: message.sender_name ?? null,
    senderId: message.sender_id ?? null,
    editedAt: message.edited_at ?? null,
    reactions: message.reactions ?? [],
    artifactData:
      message.artifact_data && typeof message.artifact_data.path === "string"
        ? (message.artifact_data as {
            path: string;
            name: string;
            size: number;
            contentType: string;
          })
        : null,
    embed: parseChatEmbed(message.artifact_data) as ChatMessage["embed"],
  };
}

// Shortcut prefixes for the new-chat screen. They prefill the composer rather than
// sending anything - shortcuts, not a rigid form.
const STARTERS = [
  { label: "Build a SaaS", prefix: "I want to build a SaaS that " },
  { label: "Launch a website", prefix: "I want to launch a website for " },
  { label: "Create an app", prefix: "I want to create an app that " },
  {
    label: "Automate a business",
    prefix: "I want to automate this business process: ",
  },
  { label: "Something else", prefix: "" },
];

const MESSAGE_PAGE_SIZE = 300;

export function ChatWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const conversationId = searchParams.get("conversationId") ?? "";

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [state, setState] = useState<ClientProjectState | null>(null);
  const [recents, setRecents] = useState<RecentConversation[]>([]);
  // Staff accounts see every conversation plus how many nobody has picked up yet.
  const [railMeta, setRailMeta] = useState<{
    isStaff: boolean;
    unseenCount: number;
    userId: string | null;
    name: string;
    role: string;
  }>({
    isStaff: false,
    unseenCount: 0,
    userId: null,
    name: "",
    role: "user",
  });
  const [proposal, setProposal] = useState<ProposalSummary | null>(null);
  const [agreement, setAgreement] = useState<AgreementSummary | null>(null);
  const [payments, setPayments] = useState<PaymentSummary[]>([]);
  // Roster for the task assignee picker: people already in this chat (staff + founder).
  const [taskParticipants, setTaskParticipants] = useState<TaskParticipant[]>(
    [],
  );
  const [input, setInput] = useState("");
  const [isReplyingTo, setIsReplyingTo] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isBooting, setIsBooting] = useState(false);
  // Older history pages. The first fetch returns the newest PAGE_SIZE rows; anything
  // older loads on demand above the transcript without moving the reader's viewport.
  const [hasOlder, setHasOlder] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const pendingPrependRef = useRef<{ height: number; scrollTop: number } | null>(
    null,
  );
  const [telegramConnected, setTelegramConnected] = useState(false);
  const [telegramCode, setTelegramCode] = useState("");
  const [telegramBotUrl, setTelegramBotUrl] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [showInviteForm, setShowInviteForm] = useState(false);

  // --- Live layer (Realtime) -------------------------------------------------------
  // Self identity for presence/typing. Deliberately the *display* name, never the email, and
  // never anything a client can set: it only shapes what other viewers see on this channel.
  const selfPresence = railMeta.userId
    ? {
        userId: railMeta.userId,
        name: railMeta.name || (railMeta.isStaff ? "BrandForge specialist" : "You"),
        staff: railMeta.isStaff,
      }
    : null;

  // Typing is derived from the composer: non-empty input, and reset as soon as it is sent.
  // Presence and typing share one Realtime channel so a topic is never subscribed twice.
  const [isTyping, setIsTyping] = useState(false);
  const livePresence = useConversationPresence(
    conversationId,
    selfPresence,
    isTyping,
  );
  const typingLabel = formatTypingLabel(livePresence.typing);

  // Transcript scroller + follow behaviour. Defined before the live-message handler so a row that
  // arrives over Realtime can follow the reader the same way a streamed answer does: only while
  // they are already at the end. Someone who scrolled up to re-read their own brief stays put and
  // gets a "Jump to latest" control instead of being dragged down by every streamed token.
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const stickToBottomRef = useRef(true);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);

  const handleTranscriptScroll = useCallback(() => {
    const node = scrollerRef.current;

    if (!node) {
      return;
    }

    const atEnd = isNearBottom(node);
    stickToBottomRef.current = atEnd;
    if (atEnd) {
      setShowJumpToLatest(false);
    }
  }, []);

  // force = the reader sent a message or opened a chat, so the newest row must come into view
  // even if they were reading something older.
  const scrollToBottom = useCallback((force = false) => {
    if (!force && !stickToBottomRef.current) {
      setShowJumpToLatest(true);
      return;
    }

    stickToBottomRef.current = true;
    setShowJumpToLatest(false);
    requestAnimationFrame(() => {
      const node = scrollerRef.current;
      if (node) {
        node.scrollTop = node.scrollHeight;
      }
    });
  }, []);

  // Rows already rendered, so a pushed row can never duplicate one the poll just delivered.
  const seenMessageIdsRef = useRef<Set<string>>(new Set());

  const handleLiveMessage = useCallback(
    (row: {
      id: string;
      sender_type: string;
      content: string;
      content_type: string | null;
      created_at: string | null;
    }) => {
      if (seenMessageIdsRef.current.has(row.id)) {
        return;
      }
      seenMessageIdsRef.current.add(row.id);

      const incoming = toChatMessage({
        id: row.id,
        sender_type: row.sender_type,
        content: row.content,
        content_type: row.content_type,
        created_at: row.created_at,
      });

      // While our own turn is streaming, the assistant bubble is already on screen. The real
      // row arrives over this same channel once the AI finishes, so accepting it now would show
      // the answer twice. The post-turn refreshMessages() picks it up instead.
      if (isStreaming && incoming.sender === "ai") {
        return;
      }

      setMessages((current) =>
        current.some((entry) => entry.id === incoming.id)
          ? current
          : [...current, incoming],
      );

      // A colleague's new row follows the reader only when they were already at the end; the
      // call is a no-op scroll when the row turned out to be a duplicate the poll delivered.
      scrollToBottom();
    },
    [isStreaming, scrollToBottom],
  );

  useRealtimeMessages(conversationId, handleLiveMessage, (event, row) => {
    if (event === "deleted") {
      seenMessageIdsRef.current.delete(row.id);
      setMessages((current) =>
        current.filter((message) => message.id !== row.id),
      );
      return;
    }
    setMessages((current) =>
      current.map((message) =>
        message.id === row.id
          ? {
              ...message,
              content: row.content,
              editedAt: row.edited_at ?? message.editedAt,
            }
          : message,
      ),
    );
  });
  const [isCreatingConversation, setIsCreatingConversation] = useState(false);
  const [attachment, setAttachment] = useState<File | null>(null);
  // Real upload state: "Uploading…" only while the POST is actually in flight.
  const [isUploading, setIsUploading] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [commandStatus, setCommandStatus] = useState<string | null>(null);
  // Desktop-style layout: the left rail is shown by default, the right insights panel is hidden
  // until the user asks for it. On mobile both become drawers.
  const [isRailOpen, setIsRailOpen] = useState(false);
  const [isContextOpen, setIsContextOpen] = useState(false);
  // Popover menus: attachments, composer actions, conversation menu, project team.
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [commandsOpen, setCommandsOpen] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);

  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const autoAnsweredRef = useRef<Set<string>>(new Set());
  // Mirror of the current conversation, readable inside async continuations: any fetch that
  // resolves after the reader switched chats checks this before touching state (H5 races).
  const conversationIdRef = useRef(conversationId);
  useLayoutEffect(() => {
    conversationIdRef.current = conversationId;
    // Scratch state that belongs to one conversation dies with it.
    pendingPrependRef.current = null;
    seenMessageIdsRef.current = new Set();
  }, [conversationId]);

  // Close every popover on outside click or Escape so no menu can strand focus.
  useEffect(() => {
    if (!attachMenuOpen && !commandsOpen && !headerMenuOpen && !teamOpen && !showInviteForm)
      return;
    const closeAll = () => {
      setAttachMenuOpen(false);
      setCommandsOpen(false);
      setHeaderMenuOpen(false);
      setTeamOpen(false);
      setShowInviteForm(false);
    };
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target || !target.closest?.(".bf-menu-root")) closeAll();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeAll();
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [attachMenuOpen, commandsOpen, headerMenuOpen, teamOpen, showInviteForm]);

  // Reset the workspace when the conversation changes (React-endorsed render-phase pattern,
  // avoids synchronous setState inside an effect).
  const [lastConversationId, setLastConversationId] = useState(conversationId);
  if (conversationId !== lastConversationId) {
    setLastConversationId(conversationId);
    setMessages([]);
    setHasOlder(false);
    setIsLoadingOlder(false);
    // A stream or spinner from the previous chat must not follow us into the next one:
    // the composer would stay locked and the loading state would strand (H5).
    setIsStreaming(false);
    setIsBooting(false);
    setState(null);
    setProposal(null);
    setAgreement(null);
    setPayments([]);
    setTaskParticipants([]);
    setError(null);
    setInput("");
    setIsReplyingTo(null);
    setAttachment(null);
    setCommandStatus(null);
    setBusyAction(null);
    setShowInviteForm(false);
    setInviteEmail("");
    setHeaderMenuOpen(false);
    setAttachMenuOpen(false);
    setCommandsOpen(false);
    setTeamOpen(false);
  }


  const loadRecents = useCallback(async () => {
    try {
      const response = await fetchAuthed("/api/conversations-list");
      if (!response.ok)
        return {
          isStaff: false,
          unseenCount: 0,
          userId: null,
          name: "",
          role: "user",
          conversations: [] as RecentConversation[],
        };
      const data = await response.json();
      const conversations: RecentConversation[] = Array.isArray(
        data.conversations,
      )
        ? data.conversations
        : [];
      setRecents(conversations);
      const meta = {
        isStaff: Boolean(data.isStaff),
        unseenCount: Number(data.unseenCount ?? 0),
        userId: typeof data.userId === "string" ? data.userId : null,
        name: typeof data.name === "string" ? data.name : "",
        role: typeof data.role === "string" ? data.role : "user",
      };
      setRailMeta(meta);
      return { ...meta, conversations };
    } catch {
      return {
        isStaff: false,
        unseenCount: 0,
        userId: null,
        name: "",
        role: "user",
        conversations: [] as RecentConversation[],
      };
    }
  }, []);

  const refreshMessages = useCallback(
    async (id: string): Promise<ChatMessage[]> => {
      const response = await fetchAuthed(
        `/api/messages?conversationId=${id}&limit=${MESSAGE_PAGE_SIZE}`,
      );
      if (!response.ok) return [];

      const data = await response.json();
      // The reader switched chats while this was in flight: these rows belong to the old
      // conversation and must not overwrite the new one (H5 race).
      if (conversationIdRef.current !== id) return [];

      const mapped: ChatMessage[] = (
        Array.isArray(data.messages) ? data.messages : []
      ).map(toChatMessage);
      setMessages(mapped);
      setHasOlder(data.hasMore === true);

      // Seed the realtime dedupe set from the authoritative fetch. Without this, a row delivered
      // by polling and then pushed over the channel in the same tick would render twice.
      const seen = new Set<string>();
      for (const entry of Array.isArray(data.messages) ? data.messages : []) {
        const id = (entry as { id?: unknown })?.id;
        if (id) {
          seen.add(String(id));
        }
      }
      seenMessageIdsRef.current = seen;

      return mapped;
    },
    [],
  );

  // Prepends the previous page of history. The viewport must not move: rows land above
  // the reader, so the scroller's scrollTop is corrected against the height delta once
  // React has rendered the new rows.
  const loadOlderMessages = useCallback(async () => {
    if (!conversationId || isLoadingOlder || !hasOlder) return;
    const requestedFor = conversationId;
    const oldest = messages[0]?.createdAt;
    if (!oldest) return;

    setIsLoadingOlder(true);
    try {
      const response = await fetchAuthed(
        `/api/messages?conversationId=${requestedFor}&limit=${MESSAGE_PAGE_SIZE}&before=${encodeURIComponent(oldest)}`,
      );
      if (!response.ok) return;

      const data = await response.json();
      // Switched conversations mid-fetch: drop the stale page instead of prepending another
      // chat's history (H5 race).
      if (conversationIdRef.current !== requestedFor) return;

      const older: ChatMessage[] = (
        Array.isArray(data.messages) ? data.messages : []
      ).map(toChatMessage);

      // Realtime rows may have landed while the page was in flight - only rows we have
      // never seen are safe to prepend, or the overlap renders twice.
      const fresh = older.filter((entry) => !seenMessageIdsRef.current.has(entry.id));

      if (fresh.length === 0) {
        setHasOlder(data.hasMore === true);
        return;
      }

      const scroller = scrollerRef.current;
      if (scroller) {
        pendingPrependRef.current = {
          height: scroller.scrollHeight,
          scrollTop: scroller.scrollTop,
        };
      }
      for (const entry of fresh) seenMessageIdsRef.current.add(entry.id);
      setMessages((current) => [...fresh, ...current]);
      setHasOlder(data.hasMore === true);
    } finally {
      setIsLoadingOlder(false);
    }
  }, [conversationId, hasOlder, isLoadingOlder, messages]);

  // Scroll compensation for loadOlderMessages: runs after the prepended rows render.
  useEffect(() => {
    const pending = pendingPrependRef.current;
    if (!pending) return;
    pendingPrependRef.current = null;
    const scroller = scrollerRef.current;
    if (scroller) {
      scroller.scrollTop = pending.scrollTop + (scroller.scrollHeight - pending.height);
    }
  }, [messages]);

  const refreshState = useCallback(
    async (id: string): Promise<ClientProjectState | null> => {
      const response = await fetchAuthed(`/api/project-context?conversationId=${id}`);
      if (!response.ok) return null;

      const data = await response.json();
      if (conversationIdRef.current !== id) return null;
      setState(data.state ?? null);

      return (data.state ?? null) as ClientProjectState | null;
    },
    [],
  );

  const refreshArtifacts = useCallback(async (id: string) => {
    const [proposalResult, agreementResult, participantsResult] =
      await Promise.all([
        fetchAuthed(`/api/proposals?conversationId=${id}`),
        fetchAuthed(`/api/agreements?conversationId=${id}`),
        fetchAuthed(`/api/participants?conversationId=${id}`),
      ]);

    if (conversationIdRef.current !== id) return;

    if (proposalResult.ok) {
      const data = await proposalResult.json();
      setProposal(data.proposal ?? null);
    }

    if (agreementResult.ok) {
      const data = await agreementResult.json();
      setAgreement(data.agreement ?? null);
      setPayments(Array.isArray(data.payments) ? data.payments : []);
    }

    // Roster for the task assignee picker. A failure only empties the picker, never the panel.
    if (participantsResult.ok) {
      const data = await participantsResult.json().catch(() => ({}));
      setTaskParticipants(shapeTaskRoster(data.participants));
    } else {
      setTaskParticipants([]);
    }
  }, []);

  // One turn: stream the answer, then reload from the database so the transcript and the
  // sidebar show persisted rows rather than client-side guesses.
  const runTurn = useCallback(
    async (id: string, message?: string) => {
      // True while the reader is still looking at the conversation this turn belongs to.
      // Streamed rows, errors and scroll pulls must never land in a chat switched to mid-turn.
      const stillHere = () => conversationIdRef.current === id;

      setError(null);
      setIsStreaming(true);

      const assistantMessageId = `local-ai-${Date.now()}`;
      const now = new Date().toISOString();

      if (message) {
        setMessages((prev) => [
          ...prev,
          {
            id: `local-user-${Date.now()}`,
            sender: "user",
            content: message,
            createdAt: now,
          },
        ]);
      }

      setMessages((prev) => [
        ...prev,
        {
          id: assistantMessageId,
          sender: "ai",
          content: "",
          createdAt: now,
          streaming: true,
        },
      ]);
      // The reader just sent something - their own message always comes into view.
      scrollToBottom(true);

      let streamedText = "";
      let succeeded = false;
      // Real activity labels streamed by the server for steps that actually ran this turn.
      const turnThoughts: string[] = [];
      let turnStatus = "Working…";

      try {
        const response = await fetchAuthed("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId: id,
            ...(message ? { message } : {}),
          }),
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || "BrandForge AI could not answer");
        }

        const reader = response.body?.getReader();

        if (!reader) {
          throw new Error("The response stream could not be read");
        }

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          // Conversation switched mid-stream: stop reading and stop rendering this turn.
          if (!stillHere()) {
            await reader.cancel().catch(() => undefined);
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";

          for (const frame of frames) {
            if (!stillHere()) break;

            const line = frame
              .split("\n")
              .find((entry) => entry.startsWith("data:"));
            if (!line) continue;

            let payload: {
              type?: string;
              chunk?: string;
              error?: string;
              state?: ClientProjectState;
              label?: string;
            };
            try {
              payload = JSON.parse(line.slice(5).trim());
            } catch {
              continue;
            }

            if (
              payload.type === "activity" &&
              typeof payload.label === "string"
            ) {
              // User-safe progress only ("Read project context") - never hidden reasoning.
              if (turnThoughts[turnThoughts.length - 1] !== payload.label) {
                turnThoughts.push(payload.label);
              }
              turnStatus = payload.label;
              setMessages((prev) =>
                prev.map((entry) =>
                  entry.id === assistantMessageId
                    ? {
                        ...entry,
                        thoughts: [...turnThoughts],
                        status: turnStatus,
                      }
                    : entry,
                ),
              );
              scrollToBottom();
            } else if (
              payload.type === "delta" &&
              typeof payload.chunk === "string"
            ) {
              streamedText += payload.chunk;
              setMessages((prev) =>
                prev.map((entry) =>
                  entry.id === assistantMessageId
                    ? { ...entry, content: streamedText }
                    : entry,
                ),
              );
              // Conditional on purpose: never pull a reader back down mid-answer.
              scrollToBottom();
            } else if (payload.type === "discard") {
              // Tool-round scaffolding text the server retracted: it was never saved, so
              // showing it would make the live transcript disagree with the database.
              streamedText = "";
              setMessages((prev) =>
                prev.map((entry) =>
                  entry.id === assistantMessageId
                    ? { ...entry, content: "" }
                    : entry,
                ),
              );
            } else if (payload.type === "state" && payload.state) {
              setState(payload.state);
            } else if (payload.type === "error") {
              throw new Error(
                payload.error || "BrandForge AI could not answer",
              );
            }
          }
        }

        succeeded = true;
        await refreshMessages(id);
        await loadRecents();

        // Carry the real activity trail onto the persisted answer row so the collapsed
        // "Thoughts" strip survives the reload from the database.
        if (turnThoughts.length > 0 && stillHere()) {
          setMessages((prev) => {
            if (prev.length === 0) return prev;
            const last = prev[prev.length - 1];
            if (last.sender !== "ai") return prev;
            return prev.map((entry, index) =>
              index === prev.length - 1
                ? { ...entry, thoughts: [...turnThoughts] }
                : entry,
            );
          });
        }
      } catch (cause) {
        if (stillHere()) {
          setError(
            cause instanceof Error
              ? cause.message
              : "BrandForge AI could not answer",
          );
          setMessages((prev) =>
            prev.filter((entry) => entry.id !== assistantMessageId),
          );
          // Never show a fabricated answer: reload reality and hand the text back for a retry.
          if (message) {
            setInput((current) => (current ? current : message));
          }
        }
        await refreshMessages(id).catch(() => undefined);
      } finally {
        // Unconditional on purpose: whichever conversation is current, a finished turn must
        // unlock the composer (the switch-time reset already cleared it for a new chat).
        setIsStreaming(false);
        if (stillHere()) scrollToBottom();
      }

      if (succeeded) {
        await refreshState(id);
      }
    },
    [loadRecents, refreshMessages, refreshState, scrollToBottom],
  );

  useEffect(() => {
    // Initial Recents load: loadRecents is async and only sets state after a fetch resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadRecents();
  }, [loadRecents]);

  // An idea typed on the landing page before sign-in waits in the composer here: the
  // visitor presses Start, signs in, and their text is already in the box to send.
  useEffect(() => {
    try {
      const pending = window.sessionStorage.getItem("brandforge:pending-message");
      if (pending) {
        window.sessionStorage.removeItem("brandforge:pending-message");
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore
        setInput(pending);
      }
    } catch {
      // Storage blocked (private mode) — nothing to restore.
    }
  }, []);

  // Opening a conversation loads persisted truth first, then answers the founder's last
  // message if the AI has not replied yet (this is how the landing page becomes a chat).
  useEffect(() => {
    if (!conversationId) {
      return;
    }

    let cancelled = false;

    (async () => {
      setIsBooting(true);
      setError(null);

      // Any rejection here used to strand the boot spinner forever: the loader only
      // cleared on the happy path (H5).
      let meta: Awaited<ReturnType<typeof loadRecents>>;
      let loadedMessages: ChatMessage[] = [];

      try {
        [meta, loadedMessages] = await Promise.all([
          loadRecents(),
          refreshMessages(conversationId),
          refreshState(conversationId),
          refreshArtifacts(conversationId),
        ]);
      } catch {
        // The boot still has to finish - the transcript shows whatever loaded, and the
        // error banner (set below by later failures) or an empty state explains the rest.
        meta = await loadRecents().catch(() => ({
          isStaff: false,
          unseenCount: 0,
          userId: null,
          name: "",
          role: "user",
          conversations: [] as RecentConversation[],
        }));
      }

      if (cancelled) return;

      setIsBooting(false);
      // Opening a chat always lands on the newest message, wherever the reader left off before.
      scrollToBottom(true);

      const lastMessage = loadedMessages[loadedMessages.length - 1];

      // Staff observe founders' histories: the AI never answers on a founder's behalf. In a
      // chat the staff member owns, they get the founder experience and the AI answers.
      const isOwn = Boolean(
        meta.userId &&
        meta.conversations.some(
          (conversation) =>
            conversation.id === conversationId &&
            conversation.ownerId === meta.userId,
        ),
      );

      if (
        (!meta.isStaff || isOwn) &&
        lastMessage &&
        lastMessage.sender === "user" &&
        !autoAnsweredRef.current.has(conversationId)
      ) {
        autoAnsweredRef.current.add(conversationId);
        await runTurn(conversationId);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    conversationId,
    loadRecents,
    refreshArtifacts,
    refreshMessages,
    refreshState,
    runTurn,
    scrollToBottom,
  ]);

  // Staff act as the team only inside chats owned by somebody else. A chat a staff member owns
  // is their own project: it behaves like any founder's chat (AI answers, founder actions).
  const handleNewChat = useCallback(() => {
    setError(null);
    router.push("/chat");
  }, [router]);

  const handleDeleteConversation = useCallback(
    async (id: string) => {
      setError(null);

      try {
        const response = await fetchAuthed("/api/conversations", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId: id }),
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            data.error || "The conversation could not be deleted",
          );
        }

        setRecents((current) =>
          current.filter((conversation) => conversation.id !== id),
        );

        if (id === conversationId) {
          router.push("/chat");
        }
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "The conversation could not be deleted",
        );
      }
    },
    [conversationId, router],
  );

  const isOwnConversation = Boolean(
    conversationId &&
    railMeta.userId &&
    recents.some(
      (conversation) =>
        conversation.id === conversationId &&
        conversation.ownerId === railMeta.userId,
    ),
  );
  const canDeleteConversation =
    Boolean(conversationId) && (!railMeta.isStaff || isOwnConversation);

  const handleSend = useCallback(
    async (suggestion?: string) => {
      const checkedText = validateMessageInput((suggestion ?? input).trim());
      const text = checkedText.value ?? "";
      if (checkedText.error && !attachment) {
        setError(checkedText.error);
        return;
      }
      const slash = parseSlashCommand(text);
      if (slash) {
        if (slash.error) {
          setError(slash.error);
          return;
        }
        setCommandStatus(null);
        if (slash.command === "help") {
          setCommandStatus("Commands: /progress, /review, /contract, /attach");
          return;
        }
        if (slash.command === "contract") {
          setIsContextOpen(true);
          setCommandStatus(
            "Review the proposal action, then accept to continue to the agreement and payment schedule.",
          );
          return;
        }
        if (slash.command === "attach") {
          setCommandStatus(
            "Choose a file below the message box, then add a caption if you want context.",
          );
          return;
        }
        if (slash.command === "progress") {
          setIsContextOpen(true);
          const progress = summarizeTaskProgress(state?.tasks ?? []);
          // Status, not a failure - the green status row is where this belongs.
          setCommandStatus(
            `${progress.done}/${progress.total} complete · ${progress.inProgress} in progress · ${progress.review} awaiting review${progress.overdue ? ` · ${progress.overdue} overdue` : ""}`,
          );
          return;
        }
        if (slash.command === "review") {
          setIsContextOpen(true);
          try {
            const response = await fetchAuthed("/api/request-review", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ conversationId }),
            });
            if (!response.ok) throw new Error("Review request failed");
            setCommandStatus("Project sent for review.");
          } catch (cause) {
            setError(
              cause instanceof Error ? cause.message : "Review request failed",
            );
          }
          return;
        }
      }

      if (attachment) {
        const checkedFile = validateAttachment(attachment);
        if (checkedFile.error) {
          setError(checkedFile.error);
          return;
        }
        if (!conversationId) {
          setError("Start a conversation before adding a file.");
          return;
        }

        try {
          setIsUploading(true);
          const form = new FormData();
          form.set("conversationId", conversationId);
          form.set("file", attachment);
          form.set("caption", text);
          const response = await fetchAuthed("/api/attachments", {
            method: "POST",
            body: form,
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok)
            throw new Error(data.error || "The file could not be uploaded");
          setAttachment(null);
          setInput("");
          await refreshMessages(conversationId);
          await loadRecents();
        } catch (cause) {
          setError(
            cause instanceof Error
              ? cause.message
              : "The file could not be uploaded",
          );
        } finally {
          setIsUploading(false);
        }
        return;
      }

      if (!text || isStreaming) {
        return;
      }

      setInput("");
      setIsReplyingTo(null);

      // BrandForge staff reply as the team (human_operator) inside a founder chat instead of
      // triggering the AI, so the founder always sees a human voice in the same chat. Sending
      // without an open chat falls through to the creation path below - staff can start one too.
      if (railMeta.isStaff && conversationId && !isOwnConversation) {
        setIsStreaming(true);

        try {
          const response = await fetchAuthed("/api/staff/post", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ conversationId, message: text }),
          });
          const data = await response.json().catch(() => ({}));

          if (!response.ok) {
            throw new Error(data.error || "The message could not be sent");
          }

          await refreshMessages(conversationId);
          await loadRecents();
        } catch (cause) {
          setError(
            cause instanceof Error
              ? cause.message
              : "The message could not be sent",
          );
          setInput(text);
        } finally {
          setIsStreaming(false);
          // Staff just posted this row - show it to them even if they had scrolled up.
          scrollToBottom(true);
        }

        return;
      }

      if (!conversationId) {
        // Someone opened /chat directly: the first message creates the project.
        setIsCreatingConversation(true);

        try {
          const response = await fetchAuthed("/api/conversations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ initialMessage: text }),
          });
          const data = await response.json().catch(() => ({}));

          if (!response.ok || !data.conversationId) {
            throw new Error(data.error || "Could not start your project");
          }

          router.push(`/chat?conversationId=${data.conversationId}`);
        } catch (cause) {
          setError(
            cause instanceof Error
              ? cause.message
              : "Could not start your project",
          );
          setInput(text);
        } finally {
          setIsCreatingConversation(false);
        }

        return;
      }

      await runTurn(conversationId, text);
    },
    [
      attachment,
      conversationId,
      input,
      isOwnConversation,
      isStreaming,
      loadRecents,
      railMeta.isStaff,
      refreshMessages,
      router,
      runTurn,
      scrollToBottom,
      state?.tasks,
    ],
  );

  // BrandForge staff: opening a chat IS picking it up. The join call registers the participant row
  // and leaves the founder-visible "joined this conversation" message, so the user can see the
  // team has arrived. Founders never trigger it (the route rejects the owner).
  const pickedUpRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (
      !conversationId ||
      !railMeta.isStaff ||
      isOwnConversation ||
      pickedUpRef.current.has(conversationId)
    ) {
      return;
    }

    pickedUpRef.current.add(conversationId);

    void (async () => {
      try {
        await fetchAuthed("/api/staff/join", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId }),
        });
        await loadRecents();
      } catch {
        // Best effort: the chat still renders if the join call fails.
      }
    })();
  }, [conversationId, isOwnConversation, loadRecents, railMeta.isStaff]);

  const handleMessageAction = useCallback(
    async (
      messageId: string,
      action: "edit" | "delete" | "react",
      value?: string,
    ) => {
      if (!conversationId) return;
      const response = await fetchAuthed("/api/messages", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageId,
          action,
          conversationId,
          ...(action === "edit" ? { content: value } : {}),
          ...(action === "react" ? { emoji: value } : {}),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Message action failed");
      await refreshMessages(conversationId);
    },
    [conversationId, refreshMessages],
  );

  function handleReply(messageId: string) {
    const message = messages.find((m) => m.id === messageId);
    if (!message) return;
    const senderName = message.senderName || "You";
    setIsReplyingTo(messageId);
    setInput(`@${senderName}: `);
    requestAnimationFrame(() => composerRef.current?.focus());
  }

  const handleRequestReview = useCallback(async () => {
    if (!conversationId) return;

    // Client-side soft lock: past DISCOVERY the handoff already fired, so skip the request
    // and say so. The server enforces the same rule (409) for anyone bypassing this.
    if (state?.status && state.status !== "DISCOVERY") {
      setError(
        state.status === "READY_FOR_REVIEW"
          ? "The brief is already with the team — keep adding context here, they reply in this chat."
          : "This project has moved past review — keep talking in this chat and the team will pick it up.",
      );
      return;
    }

    setBusyAction("review");
    setError(null);

    try {
      const response = await fetchAuthed("/api/request-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          data.error || "Could not send the requirements for review",
        );
      }

      await Promise.all([
        refreshState(conversationId),
        refreshMessages(conversationId),
        loadRecents(),
      ]);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not send the requirements for review",
      );
    } finally {
      setBusyAction(null);
    }
  }, [conversationId, loadRecents, refreshMessages, refreshState, state]);

  const loadIdentity = useCallback(async () => {
    try {
      const response = await fetchAuthed("/api/identity");
      if (!response.ok) return;
      const data = await response.json();
      setTelegramConnected(data.telegram_connected === true);
    } catch {
      // Identity fetch is best-effort.
    }
  }, []);

  const handleTelegramConnect = useCallback(async () => {
    try {
      const response = await fetchAuthed("/api/identity/telegram-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!response.ok) return;
      const data = await response.json();
      setTelegramCode(data.code ?? "");
      setTelegramBotUrl(data.botUrl ?? "");
    } catch {
      // Telegram link fetch is best-effort.
    }
  }, []);

  const handleInvite = useCallback(async () => {
    if (!conversationId || !inviteEmail.trim()) return;
    try {
      await fetchAuthed("/api/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, email: inviteEmail.trim() }),
      });
      setInviteEmail("");
      setShowInviteForm(false);
    } catch {
      // Invite is best-effort.
    }
  }, [conversationId, inviteEmail]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadIdentity();
  }, [loadIdentity]);

  const handleProposalAction = useCallback(
    async (action: "accept" | "decline" | "request_changes") => {
      if (!conversationId || !proposal) return;

      setBusyAction(action);
      setError(null);

      try {
        const status =
          action === "accept"
            ? "accepted"
            : action === "decline"
              ? "declined"
              : "changes_requested";

        const response = await fetchAuthed("/api/proposals", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ proposalId: proposal.id, status }),
        });

        if (!response.ok) {
          throw new Error("The proposal could not be updated");
        }

        if (action === "accept") {
          // Only the ids travel: the server derives the contract total and terms from
          // the accepted proposal itself.
          const agreementResponse = await fetchAuthed("/api/agreements", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              conversationId,
              proposalId: proposal.id,
            }),
          });
          const agreementData = await agreementResponse
            .json()
            .catch(() => ({}));
          if (!agreementResponse.ok || !agreementData.success) {
            await refreshArtifacts(conversationId);
            await refreshState(conversationId);
            await refreshMessages(conversationId);
            throw new Error(
              agreementData.error ||
                "The proposal was accepted, but the agreement could not be created. Contact the team before funding.",
            );
          }
        }

        await Promise.all([
          refreshArtifacts(conversationId),
          refreshState(conversationId),
          refreshMessages(conversationId),
        ]);
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "The proposal could not be updated",
        );
      } finally {
        setBusyAction(null);
      }
    },
    [conversationId, proposal, refreshArtifacts, refreshMessages, refreshState],
  );

  // Contract card actions: sign this side of the contract, or revise the terms (which
  // clears BOTH signatures server-side — the signed text must be what each side last saw).
  const handleContractAction = useCallback(
    async (
      action: "accept_contract" | "edit_contract",
      agreementId: string,
      terms?: string,
    ) => {
      if (!conversationId || !agreementId) return;

      setBusyAction(action);
      setError(null);

      try {
        const response = await fetchAuthed("/api/agreements", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            action === "accept_contract"
              ? { agreementId, action: "accept" }
              : { agreementId, terms: terms ?? "" },
          ),
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            data.error ||
              (action === "accept_contract"
                ? "The contract could not be accepted"
                : "The contract could not be updated"),
          );
        }

        await Promise.all([
          refreshArtifacts(conversationId),
          refreshMessages(conversationId),
        ]);
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "The contract action could not be completed",
        );
      } finally {
        setBusyAction(null);
      }
    },
    [conversationId, refreshArtifacts, refreshMessages],
  );

  // Task status transitions from inside the chat. Founder sees accept/send-back on delivered
  // work; the endpoint enforces staff rules server-side.
  const handleTaskAction = useCallback(
    async (
      taskId: string,
      payload: {
        action?: string;
        status?: string;
        assigneeId?: string;
        dueDate?: string | null;
      },
    ) => {
      if (!conversationId) return;

      setBusyAction(`task-${taskId}`);
      setError(null);

      try {
        const response = await fetchAuthed("/api/chat-tasks", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskId, ...payload }),
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data.error || "Could not update the task");
        }

        await Promise.all([
          refreshState(conversationId),
          refreshMessages(conversationId),
          refreshArtifacts(conversationId),
        ]);
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "Could not update the task",
        );
      } finally {
        setBusyAction(null);
      }
    },
    [conversationId, refreshArtifacts, refreshMessages, refreshState],
  );

  // Funding is real now: the founder pastes the crypto transaction hash after sending to the
  // BrandForge deposit wallet; staff verify it on-chain before the agreement turns funded.
  const handleSubmitPayment = useCallback(
    async (txHash: string) => {
      if (!conversationId || !agreement) return;

      setBusyAction("fund");
      setError(null);

      try {
        const response = await fetchAuthed("/api/payments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agreementId: agreement.id, txHash }),
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data.error || "The payment could not be submitted");
        }

        await Promise.all([
          refreshArtifacts(conversationId),
          refreshState(conversationId),
          refreshMessages(conversationId),
        ]);
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "The payment could not be submitted",
        );
      } finally {
        setBusyAction(null);
      }
    },
    [
      agreement,
      conversationId,
      refreshArtifacts,
      refreshMessages,
      refreshState,
    ],
  );

  // Staff money actions: verify the transfer on-chain, reject it, or release a milestone
  // payment to the operator after founder approval.
  const handlePaymentAction = useCallback(
    async (payload: {
      action: "verify" | "reject" | "release";
      paymentId?: string;
      note?: string;
    }) => {
      if (!conversationId || !agreement) return;

      setBusyAction(
        payload.action === "release"
          ? `release-${payload.paymentId}`
          : payload.action,
      );
      setError(null);

      try {
        const response = await fetchAuthed("/api/payments", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agreementId: agreement.id, ...payload }),
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data.error || "The payment action failed");
        }

        await Promise.all([
          refreshArtifacts(conversationId),
          refreshState(conversationId),
          refreshMessages(conversationId),
        ]);
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "The payment action failed",
        );
      } finally {
        setBusyAction(null);
      }
    },
    [
      agreement,
      conversationId,
      refreshArtifacts,
      refreshMessages,
      refreshState,
    ],
  );

  const projectLabel = state?.project.name || state?.title || "New project";
  const taskProgress = summarizeTaskProgress(state?.tasks ?? []);
  const isBusy = isStreaming || isCreatingConversation;

  // The active row from Recents carries the staff marker.
  const activeConversation =
    recents.find((conversation) => conversation.id === conversationId) ?? null;

  // Role labels: staff see "admin" or "staff"; regular users see no role badge.
  const selfRoleLabel = railMeta.isStaff
    ? railMeta.role === 'founder'
      ? 'admin'
      : 'staff'
    : null;

  // Real roster -> role labels for message headers (lowercased-name lookup).
  const participantRoles = useMemo(() => {
    const map: Record<string, string> = {};
    for (const person of taskParticipants) {
      const name = person.displayName.trim().toLowerCase();
      if (name && person.role) map[name] = formatRole(person.role);
    }
    return map;
  }, [taskParticipants]);

  // Files in this chat, derived from persisted attachment messages - never a fabricated list.
  const conversationFiles = useMemo(() => {
    const files: {
      name: string;
      size: number;
      contentType: string;
      path: string;
    }[] = [];
    const seen = new Set<string>();
    for (const message of messages) {
      const artifact = message.artifactData;
      if (!artifact || seen.has(artifact.path)) continue;
      seen.add(artifact.path);
      files.push({
        name: artifact.name,
        size: artifact.size,
        contentType: artifact.contentType ?? "",
        path: artifact.path,
      });
    }
    return files;
  }, [messages]);
return (
      <div className="flex h-screen flex-col overflow-hidden bg-[#14171a] text-[#ece7de]">
      <BetaBanner />
      <div className="flex min-h-0 flex-1 overflow-hidden">
      <ConversationRail
        recents={recents}
        activeConversationId={conversationId}
        onNewChat={handleNewChat}
        isCreatingConversation={isCreatingConversation}
        isMobileOpen={isRailOpen}
        onMobileClose={() => setIsRailOpen(false)}
        isStaff={railMeta.isStaff}
        staffUnseenCount={railMeta.unseenCount}
        telegramConnected={telegramConnected}
        onTelegramConnect={handleTelegramConnect}
        telegramCode={telegramCode}
        telegramBotUrl={telegramBotUrl}
      />

      <main className="relative flex min-w-0 flex-1 flex-col">
        <header className="bf-chat-header flex shrink-0 items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setIsRailOpen(true)}
              className="rounded-lg p-2 text-[#9aa0a6] transition hover:bg-white/5 hover:text-[#ece7de] md:hidden"
              aria-label="Open navigation"
            >
              <span aria-hidden="true">=</span>
            </button>
            <div className="min-w-0">
              <div className="flex min-w-0 items-baseline gap-2.5">
                <h1 className="truncate font-serif text-xl text-[#ece7de]">
                  {projectLabel}
                </h1>
                <span className="bf-chat-status shrink-0">
                  <span className="bf-status-dot" aria-hidden="true" />
                  {state
                    ? (STATUS_LABELS[state.status] ?? state.status)
                    : "Discovery"}
                </span>
              </div>
              <p className="mt-0.5 truncate text-xs text-[#9aa0a6]">
                {state
                  ? `${state.requirementsCount} requirement${state.requirementsCount === 1 ? "" : "s"}${
                      taskProgress.total > 0
                        ? ` · ${taskProgress.done}/${taskProgress.total} tasks`
                        : ""
                    }`
                  : "Describe what you want to build to get started"}
                {activeConversation?.staffViewedBy
                  ? ` · ${activeConversation.staffViewedBy} joined${
                      activeConversation.staffViewedAt
                        ? " " + relativeTime(activeConversation.staffViewedAt)
                        : ""
                    }`
                  : ""}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {/* Project team: real participants plus BrandForge AI - never a fabricated roster. */}
            <div className="bf-menu-root relative">
              <button
                type="button"
                onClick={() => setTeamOpen((value) => !value)}
                aria-expanded={teamOpen}
                aria-label="Show project team"
                className="bf-participants"
              >
                <span className="bf-participant-stack" aria-hidden="true">
                  <span className="bf-stack-item bf-stack-ai">B</span>
                  {taskParticipants.slice(0, 3).map((person) => (
                    <span
                      key={person.userId}
                      className="bf-stack-item"
                      style={avatarTone(person.userId)}
                    >
                      {initialsFor(person.displayName)}
                    </span>
                  ))}
                </span>
                {taskParticipants.length > 3 ? (
                  <span className="bf-stack-more">
                    +{taskParticipants.length - 3}
                  </span>
                ) : null}
              </button>
              {teamOpen ? (
                <div
                  role="dialog"
                  aria-label="Project team"
                  className="bf-menu absolute right-0 top-full z-40 mt-2 w-64 p-3"
                >
                  <p className="bf-section-label">Project team</p>
                  <ul className="mt-2 space-y-2.5">
                    <li className="flex items-center gap-2.5">
                      <span
                        className="bf-stack-item bf-stack-ai"
                        aria-hidden="true"
                      >
                        B
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-[#ece7de]">
                          BrandForge AI
                        </span>
                        <span className="block text-[10px] uppercase tracking-[0.14em] text-[#8f959b]">
                          Execution Assistant
                        </span>
                      </span>
                    </li>
                    {taskParticipants.map((person) => (
                      <li
                        key={person.userId}
                        className="flex items-center gap-2.5"
                      >
                        <span
                          className="bf-stack-item"
                          style={avatarTone(person.userId)}
                          aria-hidden="true"
                        >
                          {initialsFor(person.displayName)}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm text-[#ece7de]">
                            {person.displayName}
                          </span>
                          <span className="block text-[10px] uppercase tracking-[0.14em] text-[#8f959b]">
                            {formatRole(person.role)}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
            <div className="bf-menu-root relative">
            <button
              type="button"
              onClick={() => setHeaderMenuOpen((value) => !value)}
              aria-expanded={headerMenuOpen}
              aria-haspopup="menu"
              aria-label="Conversation menu"
              className="bf-header-menu-btn"
            >
              <span aria-hidden="true">•••</span>
            </button>
            {headerMenuOpen ? (
              <div
                role="menu"
                className="bf-menu absolute right-0 top-full z-40 mt-2 w-48 p-1"
              >
                <button
                  role="menuitem"
                  type="button"
                  className="bf-menu-item"
                  onClick={() => {
                    setIsContextOpen(true);
                    setHeaderMenuOpen(false);
                  }}
                >
                  Project context
                </button>
                <button
                  role="menuitem"
                  type="button"
                  className="bf-menu-item"
                  onClick={() => {
                    setShowInviteForm(true);
                    setHeaderMenuOpen(false);
                  }}
                >
                  Invite
                </button>
                {canDeleteConversation ? (
                  <button
                    role="menuitem"
                    type="button"
                    className="bf-menu-item bf-menu-item-danger"
                    onClick={() => {
                      setHeaderMenuOpen(false);
                      if (
                        window.confirm(
                          "Delete this chat? The project, proposal and messages go with it.",
                        )
                      ) {
                        void handleDeleteConversation(conversationId);
                      }
                    }}
                  >
                    Delete
                  </button>
                ) : null}
                </div>
            ) : null}
            {showInviteForm ? (
              <div className="bf-menu-root relative">
                <div
                  role="dialog"
                  aria-label="Invite by email"
                  className="bf-menu absolute right-0 top-full z-40 mt-2 w-56 p-3"
                >
                  <p className="bf-section-label">Invite by email</p>
                  <div className="mt-2 flex gap-2">
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(event) => setInviteEmail(event.target.value)}
                      placeholder="friend@example.com"
                      className="min-w-0 flex-1 rounded-lg border border-white/15 bg-[#14171a] px-2 py-1.5 text-sm text-[#ece7de] placeholder:text-[#8f959b]"
                    />
                    <button
                      type="button"
                      onClick={() => void handleInvite()}
                      className="rounded-lg bg-[#e8571e] px-3 py-1.5 text-xs font-semibold text-[#14171a]"
                    >
                      Send
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
            </div>
          </div>
        </header>

        <div
          ref={scrollerRef}
          className="flex-1 overflow-y-auto px-6 py-6"
          onScroll={handleTranscriptScroll}
        >
          {isBooting && messages.length === 0 ? (
            <div className="py-10 text-center" role="status" aria-live="polite">
              <p className="text-sm text-[#9aa0a6]">
                Loading your conversation…
              </p>
            </div>
          ) : !conversationId ? (
            <div className="mx-auto flex h-full w-full max-w-2xl flex-col items-center justify-center py-10 text-center">
              <div
                className="bf-ai-mark flex h-11 w-11 items-center justify-center rounded-xl"
                aria-hidden="true"
              >
                <span className="font-serif text-xl font-semibold">B</span>
              </div>
              <h1 className="mt-5 font-serif text-2xl text-[#ece7de] sm:text-3xl">
                What are you building?
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-[#9aa0a6]">
                Describe the idea in your own words. BrandForge turns it into a
                structured project and keeps the next step visible in this chat.
              </p>
              <div
                className="mt-6 flex flex-wrap justify-center gap-2"
                role="group"
                aria-label="Starter shortcuts"
              >
                {STARTERS.map((starter) => (
                  <button
                    key={starter.label}
                    type="button"
                    onClick={() => {
                      setInput((current) => current || starter.prefix);
                      requestAnimationFrame(() => composerRef.current?.focus());
                    }}
                    className="rounded-full border border-white/10 px-3.5 py-1.5 text-xs text-[#9aa0a6] transition hover:border-[#e8571e] hover:text-[#ece7de]"
                  >
                    {starter.label}
                  </button>
                ))}
              </div>
              <p className="mt-5 text-[11px] uppercase tracking-[0.16em] text-[#8f959b]">
                Tell me what is on your mind — your first message creates the
                project
              </p>
            </div>
          ) : (
            <>
              {hasOlder ? (
                <div className="mb-4 flex justify-center">
                  <button
                    type="button"
                    onClick={() => void loadOlderMessages()}
                    disabled={isLoadingOlder}
                    className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-[#9aa0a6] transition hover:border-[#e8571e] hover:text-[#ece7de] disabled:opacity-60"
                  >
                    {isLoadingOlder ? "Loading…" : "↑ Load earlier messages"}
                  </button>
                </div>
              ) : null}
            <ChatTranscript
               messages={messages}
              conversationId={conversationId}
              isStreaming={isStreaming}
              onSuggestion={(prompt) => {
                void handleSend(prompt);
              }}
              currentUserId={railMeta.userId}
              onReply={handleReply}
              onEditMessage={async (id, content) => {
                try {
                  await handleMessageAction(id, "edit", content);
                } catch (cause) {
                  setError(
                    cause instanceof Error
                      ? cause.message
                      : "Message could not be edited",
                  );
                }
              }}
              onDeleteMessage={async (id) => {
                if (
                  !window.confirm(
                    "Delete this message? The conversation will keep its place.",
                  )
                )
                  return;
                try {
                  await handleMessageAction(id, "delete");
                } catch (cause) {
                  setError(
                    cause instanceof Error
                      ? cause.message
                      : "Message could not be deleted",
                  );
                }
              }}
              onReact={async (id, emoji) => {
                try {
                  await handleMessageAction(id, "react", emoji);
                } catch (cause) {
                  setError(
                    cause instanceof Error
                      ? cause.message
                      : "Reaction could not be saved",
                  );
                }
              }}
              onEmbedAction={(embed, action, value) => {
                if (action === "details") {
                  setIsContextOpen(true);
                  return;
                }
                if (action === "submit_funding") {
                  void handleSubmitPayment(value ?? "");
                  return;
                }
                if (action === "accept") void handleProposalAction("accept");
                if (action === "accept_contract" && embed.type === "agreement") {
                  void handleContractAction("accept_contract", embed.agreementId);
                  return;
                }
                if (action === "edit_contract" && embed.type === "agreement") {
                  void handleContractAction(
                    "edit_contract",
                    embed.agreementId,
                    value ?? "",
                  );
                }
              }}
              embedBusy={busyAction !== null}
              canDecide={isOwnConversation}
              agreement={agreement}
              isStaff={railMeta.isStaff}
              selfRole={selfRoleLabel}
              participantRoles={participantRoles}
               onAskFile={(name) => {
                setInput(
                  (current) =>
                    current || `What are the most important points in ${name}?`,
                );
                requestAnimationFrame(() => composerRef.current?.focus());
              }}
              isTyping={livePresence.typing.length > 0}
              typingNames={livePresence.typing}
            />
            </>
          )}
        </div>

        {showJumpToLatest && messages.length > 0 ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-32 z-20 flex justify-center">
            <button
              type="button"
              className="bf-jump-latest pointer-events-auto"
              onClick={() => scrollToBottom(true)}
            >
              <span aria-hidden="true">↓</span> Jump to latest
            </button>
          </div>
        ) : null}
        {commandStatus ? (
          <div className="px-6 pb-2">
            <div
              className="mx-auto max-w-3xl rounded-xl border border-[#5aa578]/30 bg-[#5aa578]/10 px-4 py-3 text-sm text-[#b9e3c4]"
              role="status"
            >
              {commandStatus}
            </div>
          </div>
        ) : null}
        {error ? (
          <div className="px-6 pb-2">
            <div
              className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200"
              role="alert"
            >
              <span className="min-w-0 flex-1">{error}</span>
              {input.trim() && !isStreaming ? (
                <button
                  type="button"
                  className="bf-error-retry shrink-0"
                  onClick={() => void handleSend()}
                >
                  Try again
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* Typing + who-else-is-here. One polite live region so a screen reader announces the
            change without interrupting; the animated dot is decorative. */}
        <div className="px-4 sm:px-6">
          <div
            className="mx-auto flex h-6 max-w-3xl items-center gap-2 text-xs text-[#9aa0a6]"
            role="status"
            aria-live="polite"
          >
            {typingLabel ? (
              <>
                <span aria-hidden="true" className="flex gap-1">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#e8571e]" />
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#e8571e] [animation-delay:150ms]" />
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#e8571e] [animation-delay:300ms]" />
                </span>
                <span>{typingLabel}</span>
              </>
            ) : livePresence.viewers.length > 0 ? (
              <span>
                {livePresence.viewers.length === 1
                  ? `${livePresence.viewers[0].name} is also here`
                  : `${livePresence.viewers.length} others are also here`}
              </span>
            ) : null}
          </div>
        </div>

        <div className="bf-composer-shell sticky bottom-0 shrink-0">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void handleSend();
            }}
            className="mx-auto max-w-3xl"
          >
            {attachment ? (
              <div className="bf-composer-chip" role="status">
                <span aria-hidden="true">📄</span>
                <span className="min-w-0 flex-1 truncate">
                  {attachment.name}
                </span>
                <span className="text-[10px] text-[#9aa0a6]">
                  {Math.ceil(attachment.size / 1024)} KB
                </span>
                <span
                  className={`bf-chip-state${isUploading ? " is-busy" : ""}`}
                >
                  {isUploading ? "Uploading…" : "Ready"}
                </span>
                <button
                  type="button"
                  onClick={() => setAttachment(null)}
                  disabled={isUploading}
                  aria-label="Remove file"
                  className="bf-chip-remove"
                >
                  ×
                </button>
              </div>
            ) : null}
            {isReplyingTo ? (
              <div className="mb-2 flex items-center justify-between rounded-lg border border-[#e8571e]/30 bg-[#1c2024] px-3 py-2 text-xs text-[#ece7de]">
                <span>Replying to message</span>
                <button
                  type="button"
                  onClick={() => {
                    setIsReplyingTo(null);
                    setInput("");
                  }}
                  className="text-[#9aa0a6] hover:text-[#ece7de]"
                >
                  ✕
                </button>
              </div>
            ) : null}
            {/* Soft lock: the brief already fired the handoff. Chat stays open — keep adding
                context — but the next move belongs to the team, not another send-for-review. */}
            {state?.status === "READY_FOR_REVIEW" && !railMeta.isStaff ? (
              <div
                className="mb-2 flex items-center gap-2 rounded-xl border border-[#e8571e]/25 bg-[#e8571e]/10 px-3 py-2 text-xs leading-relaxed text-[#f6d6c3]"
                role="status"
              >
                <span className="bf-status-dot" aria-hidden="true" />
                <span>
                  Brief with the team — waiting for review. Keep adding context here;
                  they reply in this chat.
                </span>
              </div>
            ) : null}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,application/pdf,text/plain,application/json,application/zip,text/csv,audio/webm,audio/ogg,audio/mpeg,audio/mp4"
              disabled={isBusy || !conversationId}
              onChange={(event) =>
                setAttachment(event.target.files?.[0] ?? null)
              }
              className="sr-only"
              tabIndex={-1}
              aria-label="Choose a file to attach"
            />
            <div className="bf-composer">
              <textarea
                ref={composerRef}
                value={input}
                onChange={(event) => {
                  setInput(event.target.value);
                  setIsTyping(Boolean(event.target.value.trim()));
                }}
                placeholder={
                  isReplyingTo
                    ? "Type your reply…"
                    : conversationId
                      ? "Ask anything…"
                      : "Describe what you want to build…"
                }
                rows={2}
                disabled={isBusy}
                className="bf-composer-input"
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void handleSend();
                  }
                }}
              />
              <button
                type="submit"
                disabled={isBusy || (!input.trim() && !attachment)}
                aria-label={
                  isStreaming ? "BrandForge is answering" : "Send message"
                }
                className="bf-composer-send"
              >
                <span aria-hidden="true">{isStreaming ? "···" : "↑"}</span>
              </button>
            </div>
            {/* Footer: attach + actions. Slash commands are discoverable here, not plastered
                across the composer as permanent chips. */}
            <div className="mt-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <div className="bf-menu-root relative">
                  <button
                    type="button"
                    className="bf-composer-tool"
                    aria-expanded={attachMenuOpen}
                    aria-haspopup="menu"
                    disabled={!conversationId}
                    title={
                      conversationId
                        ? undefined
                        : "Send your first message to start the project, then attach files."
                    }
                    onClick={() => setAttachMenuOpen((value) => !value)}
                  >
                    <span aria-hidden="true">＋</span> Attach
                  </button>
                  {attachMenuOpen ? (
                    <div
                      role="menu"
                      className="bf-menu absolute bottom-full left-0 z-40 mb-2 w-64 p-1"
                    >
                      <button
                        type="button"
                        role="menuitem"
                        className="bf-menu-item"
                        onClick={() => {
                          setAttachMenuOpen(false);
                          fileInputRef.current?.click();
                        }}
                      >
                        Upload a file…
                        <span className="bf-menu-hint">
                          PNG, PDF, TXT, CSV, JSON, ZIP, audio · up to 10 MB
                        </span>
                      </button>
                    </div>
                  ) : null}
                </div>
                <div className="bf-menu-root relative">
                  <button
                    type="button"
                    className="bf-composer-tool"
                    aria-expanded={commandsOpen}
                    aria-haspopup="menu"
                    onClick={() => setCommandsOpen((value) => !value)}
                  >
                    <span aria-hidden="true">／</span> Actions
                  </button>
                  {commandsOpen ? (
                    <div
                      role="menu"
                      className="bf-menu absolute bottom-full left-0 z-40 mb-2 w-60 p-1"
                    >
                      {[
                        { command: "/progress", label: "Progress report" },
                        {
                          command: "/review",
                          label: "Send to BrandForge review",
                        },
                        { command: "/contract", label: "Agreement steps" },
                        { command: "/attach", label: "How to attach a file" },
                      ].map((item) => (
                        <button
                          key={item.command}
                          type="button"
                          role="menuitem"
                          className="bf-menu-item"
                          onClick={() => {
                            setCommandsOpen(false);
                            setInput((current) =>
                              insertComposerCommand(current, item.command),
                            );
                            requestAnimationFrame(() =>
                              composerRef.current?.focus(),
                            );
                          }}
                        >
                          {item.label}
                          <span className="bf-menu-hint">{item.command}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
              <p className="text-[10px] uppercase tracking-[0.16em] text-[#8f959b]">
                Enter to send
              </p>
            </div>
          </form>
        </div>
      </main>

      {isContextOpen ? (
        <ProjectContextPanel
          state={state}
          proposal={proposal}
          agreement={agreement}
          payments={payments}
          busyAction={busyAction}
          isStaff={railMeta.isStaff && !isOwnConversation}
          participants={taskParticipants}
          files={conversationFiles}
          onClose={() => setIsContextOpen(false)}
          onRequestReview={() => {
            void handleRequestReview();
          }}
          onProposalAction={(action) => {
            void handleProposalAction(action);
          }}
          onSubmitPayment={(txHash) => {
            void handleSubmitPayment(txHash);
          }}
          onPaymentAction={(payload) => {
            void handlePaymentAction(payload);
          }}
          onTaskAction={(taskId, payload) => {
            void handleTaskAction(taskId, payload);
          }}
        />
      ) : null}
      </div>
    </div>
  );
}
