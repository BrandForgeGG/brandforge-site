"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useRealtimeMessages } from "@/lib/realtime-messages";
import { useConversationPresence } from "@/lib/presence";
import { formatTypingLabel } from "@/lib/presence-utils";
import { avatarTone, formatRole, initialsFor } from "@/lib/identity-display";
import Link from "next/link";
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
import { fetchAuthed, getSessionUser } from "@/lib/browser-auth";
import { trackEvent } from "@/lib/funnel-client";
import { useLogin } from "@/components/login-dialog";
import { GuestSaveBar } from "@/components/guest-save-bar";
import { VideoReadyBar } from "@/components/video-ready-bar";
import { PeerContractForm } from "@/components/peer-contract-card";
import { extractOutline } from "@/lib/deliverable-outline";
import { ChatTranscript, type ChatMessage } from "@/components/chat-transcript";
import {
  ConversationRail,
  type RecentConversation,
} from "@/components/conversation-rail";
import { STATUS_LABELS, type AgreementSummary, type PaymentSummary, type ProposalSummary, type TaskParticipant } from "@/components/project-context-panel";

const VideoMaker = dynamic(() => import("@/components/video-maker").then((mod) => mod.VideoMaker), { ssr: false });

const ProjectContextPanel = dynamic(
  () => import("@/components/project-context-panel").then((mod) => mod.ProjectContextPanel),
  { ssr: false, loading: () => null }
);

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

// Counter terms travel from the proposal card as a JSON string (the same value slot the
// contract editor uses for terms text). Anything malformed returns undefined and the route
// answers with its own validation error instead of a broken request.
function parseCounterTerms(value?: string): {
  totalAmount: number;
  weeksMin: number;
  weeksMax: number;
  note?: string | null;
} | undefined {
  try {
    const parsed = JSON.parse(value ?? "") as {
      totalAmount?: unknown;
      weeksMin?: unknown;
      weeksMax?: unknown;
      note?: unknown;
    };
    if (
      typeof parsed.totalAmount === "number" &&
      typeof parsed.weeksMin === "number" &&
      typeof parsed.weeksMax === "number"
    ) {
      return {
        totalAmount: parsed.totalAmount,
        weeksMin: parsed.weeksMin,
        weeksMax: parsed.weeksMax,
        note: typeof parsed.note === "string" ? parsed.note : null,
      };
    }
  } catch {
    // Fall through to undefined: the route reports the missing terms.
  }
  return undefined;
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
            generated?: boolean;
            caption?: string;
            scene?: number;
          })
        : null,
    embed: parseChatEmbed(message.artifact_data) as ChatMessage["embed"],
  };
}

const MESSAGE_PAGE_SIZE = 300;

// Visitors may send their first message without an account (decided 2026-10-09); the sign-in bar,
// header button and sidebar card ask after the first answer. Flip to true to require sign-in first.
const GATE_FIRST_MESSAGE = false;

// The slash vocabulary, shared by the Actions menu and the composer autocomplete so the
// two surfaces can never disagree about which commands exist.
const SLASH_COMMANDS = [
  { command: "/progress", label: "Progress report" },
  { command: "/review", label: "Send to BrandForge review" },
  { command: "/contract", label: "Agreement steps" },
  { command: "/attach", label: "How to attach a file" },
  { command: "/help", label: "List all commands" },
];

// Suggested next moves live in the Actions menu, not as a row under every answer.
// Every action works like "Create an image:": a short prefix lands in the box with the cursor after
// the colon, and the person finishes the sentence.
const NEXT_STEP_ACTIONS = [
  { key: 'image', label: 'Create an image', text: 'Create an image: ' },
  { key: 'ads', label: 'Create ads', text: 'Create ads: ' },
  { key: 'calendar', label: 'Create a 30-day calendar', text: 'Create a 30-day content calendar: ' },
  { key: 'audit', label: 'Audit a URL', text: 'Audit this URL: https://' },
  { key: 'video', label: 'Create a video', text: 'Create a video: ' },
] as const;


// Starting points under the composer: one tap fills it, the tooltip says what comes back.
const START_PROMPTS = [
  { label: 'Make a carousel', hint: 'Swipeable slides from one sentence', text: '', href: '/create?make=carousel', icon: 'M5 5h8v10H5zM7 3.5h8V13M3.5 7v8' },
  { label: 'Plan my idea', hint: 'Scope, roadmap and estimate', text: 'I have an idea: ', icon: 'M4 4.5h4v4H4zM12 4.5h4v4h-4zM8 6.5h4M6 8.5v4h6M12 12.5h4v3h-4z' },
  { label: 'Audit a URL', hint: 'A ranked fix list from your page', text: 'Audit this site and tell me what to fix first: https://', icon: 'M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM13 13l3.5 3.5' },
  { label: 'Write ads', hint: 'Hooks and copy for each platform', text: 'Write ads for ', icon: 'M3.5 9.5v-3l9-3v9zM12.5 6.5h3a1.5 1.5 0 010 3h-3M6 12.5l1 3.5h2l-.8-3' },
  { label: 'Make an image', hint: 'Free, right in the chat', text: 'Create an image: ', icon: 'M4 5h12v10H4zM4 13l3.5-3.5 3 3 2-2L16 14M13 8.2h.01' },
] as const;

function StartPrompts({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="bf-start-prompts mx-auto w-full max-w-3xl px-4 sm:px-6">
      <div className="flex flex-wrap justify-center gap-2" role="group" aria-label="Starting points">
        {START_PROMPTS.map((item) => (
          <button key={item.label} type="button" data-tip={item.hint} onClick={() => ('href' in item && item.href ? window.location.assign(item.href) : onPick(item.text))} className="bf-start-chip">
            <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d={item.icon} />
            </svg>
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// You -> AI -> People: the whole product in one small, quietly animated line.
function AiPeopleFlow() {
  const nodes: [number, string][] = [
    [40, 'You'],
    [140, 'AI'],
    [240, 'People'],
  ];
  return (
    <svg viewBox="0 0 280 44" className="bf-flow-diagram mx-auto mt-5 h-11 w-[17.5rem] max-w-full" role="img" aria-label="You describe it, AI drafts it, people refine it">
      <g fill="none" stroke="var(--line)" strokeWidth="1.5">
        <path d="M76 22h28" />
        <path d="M176 22h28" />
      </g>
      <g fill="none" stroke="var(--ember)" strokeWidth="1.8" strokeLinecap="round">
        <path className="bf-flow" d="M76 22h28" pathLength={1} />
        <path className="bf-flow" style={{ animationDelay: '0.5s' }} d="M176 22h28" pathLength={1} />
      </g>
      {nodes.map(([x, label]) => (
        <g key={label}>
          <rect x={x - 32} y="8" width="64" height="28" rx="14" fill="var(--panel)" stroke="var(--line)" />
          <text x={x} y="26.5" textAnchor="middle" fontSize="11" fill="var(--foreground)" fontFamily="var(--font-sans)">{label}</text>
        </g>
      ))}
    </svg>
  );
}

// One quiet pointer, shown once, after the first answer: where the extra powers live.
function ActionsHint({ show, onDismiss }: { show: boolean; onDismiss: () => void }) {
  if (!show) return null;
  return (
    <div className="bf-hint" role="status">
      <p className="text-xs leading-snug text-foreground">
        <span className="font-medium">Actions</span> makes images, ads, a content calendar or a video, and invites your team.
      </p>
      <button type="button" onClick={onDismiss} className="mt-1.5 text-xs text-ember underline-offset-2 hover:underline">
        Got it
      </button>
    </div>
  );
}

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
  const [inviteEmail, setInviteEmail] = useState("");
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [showContractForm, setShowContractForm] = useState(false);
  // One-time pointer to Actions, shown after the first answer arrives.
  const [actionsHintSeen, setActionsHintSeen] = useState(true);
  // A signed-out browser carries the readable bf_guest cookie: it gets a Sign in button, and the
  // one-time Actions pointer waits (the save bar already sits in the same spot).
  const [isGuestBrowser, setIsGuestBrowser] = useState(false);
  const { openLogin: openGuestLogin } = useLogin();
  useEffect(() => {
    // Restore the idea typed before signing in, once, into an empty composer.
    try {
      const pending = localStorage.getItem("bf:pending-idea");
      if (pending && /sb-[^=;]+-auth-token/.test(document.cookie)) {
        localStorage.removeItem("bf:pending-idea");
        // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore of a browser-only draft
        setInput((current) => current || pending);
      }
    } catch {
      /* storage blocked */
    }
  }, []);
  // Counts a signed-in person coming back on a later day (one event per browser per UTC day).
  useEffect(() => {
    void getSessionUser()
      .then((user) => {
        if (!user) return;
        try {
          const today = new Date().toISOString().slice(0, 10);
          const last = localStorage.getItem("bf:last-visit");
          if (last && last !== today) trackEvent("session_returned", { signed_in: true });
          localStorage.setItem("bf:last-visit", today);
        } catch {
          /* storage blocked */
        }
      })
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    // Signed out = no session. A brand-new visitor has no auth cookie at all, so they count from
    // the first paint; a browser that does hold one is confirmed with the session check.
    if (!/sb-[^=;]+-auth-token/.test(document.cookie)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read a browser-only cookie once
      setIsGuestBrowser(true);
      return;
    }
    let live = true;
    void getSessionUser()
      .then((user) => {
        if (live) setIsGuestBrowser(user === null);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read a browser-only flag once
      setActionsHintSeen(localStorage.getItem("bf:hint-actions") === "1");
    } catch {
      /* storage blocked: stay quiet */
    }
  }, []);
  function dismissActionsHint() {
    setActionsHintSeen(true);
    try {
      localStorage.setItem("bf:hint-actions", "1");
    } catch {
      /* ignore */
    }
  }
  // Staff proposal composer: the send side of POST /api/proposals. Opens from the
  // "Brief ready" strip above the composer while the conversation waits for review.
  const [showProposalForm, setShowProposalForm] = useState(false);
  const [proposalTitle, setProposalTitle] = useState("");
  const [proposalScope, setProposalScope] = useState("");
  const [proposalQuote, setProposalQuote] = useState("");
  const [proposalWeeks, setProposalWeeks] = useState("");
  const [proposalSending, setProposalSending] = useState(false);

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

  const [isCreatingConversation, setIsCreatingConversation] = useState(false);
  const [attachment, setAttachment] = useState<File | null>(null);
  // Real upload state: "Uploading…" only while the POST is actually in flight.
  const [isUploading, setIsUploading] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Set when the sector filter declined what the person typed, so they can ask a human to look.
  const [policyHit, setPolicyHit] = useState<{ text: string; category: string } | null>(null);
  const [reviewAsked, setReviewAsked] = useState(false);
  const [commandStatus, setCommandStatus] = useState<string | null>(null);
  // Desktop-style layout: the left rail is shown by default, the right insights panel is hidden
  // until the user asks for it. On mobile both become drawers.
  const [isRailOpen, setIsRailOpen] = useState(false);
  const [isContextOpen, setIsContextOpen] = useState(false);
  const [isVideoOpen, setIsVideoOpen] = useState(false);
  // Popover menus: attachments, composer actions, conversation menu, project team.
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [commandsOpen, setCommandsOpen] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);
  // Autocomplete: highlighted row + whether the reader dismissed the popup for this text.
  const [slashIndex, setSlashIndex] = useState(0);
  const [slashClosed, setSlashClosed] = useState(false);
  // AI participation: when false, the AI does not automatically reply or update project context.
  const [aiEnabled, setAiEnabled] = useState(true);

  // Matches only when the composer starts with a slash word: typing "/" anywhere else
  // is just prose and must never summon the popup.
  const slashQuery = input.match(/^\/([a-z]*)$/i)?.[1] ?? null;
  const slashMatches =
    slashQuery === null || slashClosed
      ? []
      : SLASH_COMMANDS.filter((item) =>
          item.command.startsWith(`/${slashQuery.toLowerCase()}`),
        );
  const slashHighlight =
    slashMatches.length === 0 ? 0 : Math.min(slashIndex, slashMatches.length - 1);

  const insertSlashCommand = (command: string) => {
    setInput((current) =>
      /^\/[a-z]*$/i.test(current) ? `${command} ` : insertComposerCommand(current, command),
    );
    setSlashClosed(true);
    requestAnimationFrame(() => composerRef.current?.focus());
  };

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
    setShowProposalForm(false);
    setProposalTitle("");
    setProposalScope("");
    setProposalQuote("");
    setProposalWeeks("");
    setProposalSending(false);
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

  // A pushed row reaches the open tab here. Defined after the refreshers on purpose: a
  // system row is a status moment (proposal sent, review receipt, funding) and the strips
  // keyed off conversation status only learn about it from a fresh state fetch.
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

      // The row above is only half the moment: the waiting/proposal strips key off
      // conversation status and the card's actions off artifacts, both separate fetches.
      // Reload them so an open tab flips the moment a proposal arrives, without the
      // reader refreshing the page.
      if (row.content_type === "system") {
        void refreshState(conversationId);
        void refreshArtifacts(conversationId);
        void refreshMessages(conversationId);
      }
    },
    [
      conversationId,
      isStreaming,
      refreshArtifacts,
      refreshMessages,
      refreshState,
      scrollToBottom,
    ],
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
          throw Object.assign(new Error(payload.error || "BrandForge AI could not answer"), {
            policy: typeof payload.policy === "string" ? payload.policy : null,
          });
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
          const policy = (cause as { policy?: string | null } | null)?.policy ?? null;
          setPolicyHit(policy && message ? { text: message, category: policy } : null);
          setReviewAsked(false);
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
      // Starting a new chat takes an account: the idea is kept and the sign-in pop-up opens. Chats a
      // guest already has stay open, and the bots keep their own guest path.
      if (GATE_FIRST_MESSAGE && isGuestBrowser && !conversationId && text) {
        try {
          localStorage.setItem("bf:pending-idea", text);
        } catch {
          /* storage blocked: the text stays in the composer anyway */
        }
        trackEvent("guest_send_gated", { source: "composer" });
        openGuestLogin({ reason: "start", next: "/" });
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
        // A guest (no rail user — signed-out visitors reach /chat via a valid bf_bp
        // session cookie) opts in explicitly so anonymous POSTs without the flag
        // keep their 401 contract on the server.
        setIsCreatingConversation(true);

        try {
          const response = await fetchAuthed("/api/conversations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              initialMessage: text,
              ...(railMeta.userId ? {} : { guest: true }),
            }),
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
      isGuestBrowser,
      openGuestLogin,
      isOwnConversation,
      isStreaming,
      loadRecents,
      railMeta.isStaff,
      railMeta.userId,
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

  // The right panel is where the AI's work becomes visible (name, requirements, next steps).
  // Open it once per chat on wide screens as soon as something has been recorded, so the
  // work appears to land instead of hiding behind a menu. Closing it sticks.
  // Mirror the newest AI answer in the panel as it streams (its own client-side read of the
  // markdown; the panel never waits for a tool call to show what the chat already holds).
  // Scenes are generated in parallel and can finish out of order, so each carries its number.
  // Only a run of consecutive numbered images is re-sorted; everything else keeps chat order.
  const videoImages = (() => {
    const list = messages
      .filter((entry) => entry.artifactData?.contentType?.startsWith("image/"))
      .map((entry) => ({
        url: `/api/attachments?path=${encodeURIComponent(entry.artifactData!.path)}`,
        label: entry.artifactData!.name,
        caption: entry.artifactData!.caption,
        scene: entry.artifactData!.scene,
      }));
    const ordered: typeof list = [];
    let run: typeof list = [];
    const flush = () => {
      ordered.push(...run.sort((a, b) => (a.scene ?? 0) - (b.scene ?? 0)));
      run = [];
    };
    for (const item of list) {
      if (item.scene) run.push(item);
      else {
        flush();
        ordered.push(item);
      }
    }
    flush();
    return ordered;
  })();

  const latestAiContent = [...messages]
    .reverse()
    .find((entry) => entry.sender === "ai" && entry.content.trim())?.content;
  const answerOutline = useMemo(() => extractOutline(latestAiContent), [latestAiContent]);
  const showActionsHint =
    !actionsHintSeen && !isGuestBrowser && Boolean(conversationId) && !isStreaming && messages.some((entry) => entry.sender === "ai" && entry.content.length > 40);

  const autoOpenedPanelRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!conversationId || !state || state.conversationId !== conversationId) return;
    if (autoOpenedPanelRef.current.has(conversationId)) return;
    if ((state.requirementsCount > 0 || answerOutline) && window.innerWidth >= 1280) {
      autoOpenedPanelRef.current.add(conversationId);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time reveal per chat
      setIsContextOpen(true);
    }
  }, [state, conversationId, answerOutline]);

  const handleRequestReview = useCallback(async () => {
    if (!conversationId) return;

    // A guest has no account for the team to answer: sending a brief for human review
    // is the natural moment to ask them to save the chat, then continue here.
    if (!railMeta.userId && !/sb-[^=;]+-auth-token/.test(document.cookie) && document.cookie.includes("bf_guest=")) {
      router.push(
        `/login?next=${encodeURIComponent(`/chat?conversationId=${conversationId}`)}`,
      );
      return;
    }

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
  }, [router, railMeta.userId, conversationId, loadRecents, refreshMessages, refreshState, state]);

  const loadIdentity = useCallback(async () => {
    try {
      const response = await fetchAuthed("/api/identity");
      if (!response.ok) return;
      const data = await response.json();
      // Accounts that never finished onboarding (terms, birthday, username) go
      // there first; /onboarding sends them back here once it is done.
      if (data?.onboarding_completed === false) {
        router.replace("/onboarding");
      }
    } catch {
      // Identity fetch is best-effort.
    }
  }, [router]);

  const [inviteNote, setInviteNote] = useState("");
  const handleCopyInviteLink = useCallback(async () => {
    if (!conversationId) return;
    try {
      const response = await fetchAuthed("/api/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, link: true }),
      });
      const data = (await response.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!response.ok || !data.url) {
        setInviteNote(data.error || "Could not create a link.");
        return;
      }
      await navigator.clipboard.writeText(data.url);
      trackEvent('invite_link_copied');
      setInviteNote("Team link copied — anyone with it can join after signing in.");
    } catch {
      setInviteNote("Could not copy the link.");
    }
  }, [conversationId]);

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

  const handleSendProposal = useCallback(async () => {
    if (!conversationId || proposalSending) return;

    const title = proposalTitle.trim();
    const scope = proposalScope.trim();
    const quote = Number(proposalQuote);
    const weeks = Number(proposalWeeks);

    if (!title || !scope) {
      setError("Add a title and the technical approach before submitting.");
      return;
    }
    if (!Number.isFinite(quote) || quote < 1) {
      setError("The final quote must be at least 1 EUR.");
      return;
    }
    if (!Number.isFinite(weeks) || weeks < 1) {
      setError("The timeline must be at least 1 week.");
      return;
    }

    setProposalSending(true);
    setError(null);

    try {
      const response = await fetchAuthed("/api/proposals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId,
          title,
          scope,
          totalAmount: quote,
          estimatedWeeksMin: Math.floor(weeks),
          estimatedWeeksMax: Math.floor(weeks),
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "The proposal could not be sent");
      }

      setShowProposalForm(false);
      setProposalTitle("");
      setProposalScope("");
      setProposalQuote("");
      setProposalWeeks("");

      await Promise.all([
        refreshState(conversationId),
        refreshMessages(conversationId),
        refreshArtifacts(conversationId),
        loadRecents(),
      ]);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "The proposal could not be sent",
      );
    } finally {
      setProposalSending(false);
    }
  }, [
    conversationId,
    loadRecents,
    proposalQuote,
    proposalScope,
    proposalSending,
    proposalTitle,
    proposalWeeks,
    refreshArtifacts,
    refreshMessages,
    refreshState,
  ]);

  useEffect(() => {
    void loadIdentity();
  }, [loadIdentity]);

  const handleProposalAction = useCallback(
    async (
      action: "accept" | "decline" | "request_changes" | "counter" | "counter_back",
      terms?: {
        totalAmount: number;
        weeksMin: number;
        weeksMax: number;
        note?: string | null;
      },
    ) => {
      if (!conversationId || !proposal) return;

      setBusyAction(action);
      setError(null);

      try {
        const status =
          action === "accept"
            ? "accepted"
            : action === "decline"
              ? "declined"
              : action === "counter"
                ? "countered"
                : action === "counter_back"
                  ? "counter_back"
                  : "changes_requested";

        const response = await fetchAuthed("/api/proposals", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            proposalId: proposal.id,
            status,
            ...(terms
              ? {
                  counterTotalAmount: terms.totalAmount,
                  counterWeeksMin: terms.weeksMin,
                  counterWeeksMax: terms.weeksMax,
                  counterNote: terms.note ?? null,
                }
              : {}),
          }),
        });

        if (!response.ok) {
          // The server explains refused transitions itself ("a countered proposal cannot
          // become accepted") — show that instead of a generic failure line.
          const data = await response.json().catch(() => ({}));
          throw new Error(
            typeof data.error === "string" && data.error
              ? data.error
              : "The proposal could not be updated",
          );
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

  const projectLabel = state?.project.name || state?.title || "New chat";
  const taskProgress = useMemo(
    () => summarizeTaskProgress(state?.tasks ?? []),
    [state?.tasks],
  );
  const isBusy = isStreaming || isCreatingConversation;

  // The active row from Recents carries the staff marker.
  const activeConversation =
    recents.find((conversation) => conversation.id === conversationId) ?? null;

  // Sync AI enabled state from the conversation data (adjusted during render, not in an effect).
  const [syncedAiEnabled, setSyncedAiEnabled] = useState<boolean | undefined>(undefined);
  if (activeConversation?.aiEnabled !== undefined && activeConversation.aiEnabled !== syncedAiEnabled) {
    setSyncedAiEnabled(activeConversation.aiEnabled);
    setAiEnabled(activeConversation.aiEnabled);
  }

  // Role labels: staff see "admin" or "staff"; regular users see no role badge.
  // The rail reports the profiles.role value ('admin'), with the legacy email hint
  // ('founder') as fallback for rows that predate it.
  const selfRoleLabel = railMeta.isStaff
    ? railMeta.role === 'admin' || railMeta.role === 'founder'
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
      <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
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
      />

      <main className="relative flex min-w-0 flex-1 flex-col" data-empty={!conversationId && !isBooting ? "true" : undefined}>
        <header className="bf-chat-header flex shrink-0 items-center justify-between gap-3 px-4 py-1.5 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setIsRailOpen(true)}
              className="rounded-lg p-2 text-muted transition hover:bg-overlay hover:text-foreground md:hidden"
              aria-label="Open navigation"
            >
              <span aria-hidden="true">=</span>
            </button>
            <div className="flex min-w-0 items-center gap-2">
              <p
                role={conversationId ? "heading" : undefined}
                aria-level={conversationId ? 1 : undefined}
                className="truncate text-sm font-medium text-foreground"
                title={
                  state
                    ? `${state.requirementsCount} requirement${state.requirementsCount === 1 ? "" : "s"}${
                        taskProgress.total > 0 ? ` · ${taskProgress.done}/${taskProgress.total} tasks` : ""
                      }`
                    : undefined
                }
              >
                {projectLabel}
              </p>
              {/* Status is a dot, not a pill: the words live in the tooltip and for screen readers. */}
              <span
                className="bf-status-dot shrink-0"
                role="img"
                aria-label={state ? (STATUS_LABELS[state.status] ?? state.status) : "Discovery"}
                title={state ? (STATUS_LABELS[state.status] ?? state.status) : "Discovery"}
              />
              {activeConversation?.staffViewedBy ? (
                <span className="hidden truncate text-xs text-muted sm:inline">
                  {activeConversation.staffViewedBy} joined
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {isGuestBrowser ? (
              <button
                type="button"
                onClick={() => openGuestLogin({ reason: "save", next: conversationId ? `/chat?conversationId=${conversationId}` : "/" })}
                className="rounded-full border border-line px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-overlay"
              >
                Sign in
              </button>
            ) : null}
            {conversationId ? (
              <>
            <button
              type="button"
              onClick={() => {
                const next = !aiEnabled;
                setAiEnabled(next);
                if (conversationId) {
                  void fetchAuthed(`/api/conversations/${conversationId}/ai-toggle`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ aiEnabled: next }),
                  }).catch(() => {
                    setAiEnabled(!next);
                  });
                }
              }}
              aria-pressed={aiEnabled}
              aria-label={aiEnabled ? 'Disable AI participation' : 'Enable AI participation'}
              data-tip={aiEnabled ? 'AI is on. Click to pause it.' : 'AI is paused. Click to turn it on.'}
              data-tip-pos="below"
              className="bf-composer-tool"
            >
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill={aiEnabled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
                <path d="M10 2.5l1.7 4.6 4.6 1.7-4.6 1.7L10 15.1l-1.7-4.6L3.7 8.8l4.6-1.7z" />
              </svg>
            </button>
            {/* Project team: real participants plus BrandForge AI - never a fabricated roster. */}
            <div className="bf-menu-root relative">
              <button
                type="button"
                onClick={() => setTeamOpen((value) => !value)}
                aria-expanded={teamOpen}
                aria-label="Show project team"
                data-tip="Everyone in this chat"
                data-tip-pos="below"
                className="bf-participants"
              >
                <span className="bf-participant-stack" aria-hidden="true">
                  <span className="bf-stack-item bf-stack-ai overflow-hidden">
                    {/* eslint-disable-next-line @next/next/no-img-element -- bundled local asset at a fixed size */}
                    <img src="/discord-server-icon.png" alt="" className="h-full w-full object-cover" />
                  </span>
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
                        className="bf-stack-item bf-stack-ai overflow-hidden"
                        aria-hidden="true"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- bundled local asset at a fixed size */}
                        <img src="/discord-server-icon.png" alt="" className="h-full w-full object-cover" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-foreground">
                          BrandForge AI
                        </span>
                        <span className="block text-[10px] uppercase tracking-[0.14em] text-muted">
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
                          <span className="block truncate text-sm text-foreground">
                            {person.displayName}
                          </span>
                          <span className="block text-[10px] uppercase tracking-[0.14em] text-muted">
                            {formatRole(person.role)}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
              </>
            ) : null}
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
                  <button
                    type="button"
                    onClick={() => void handleCopyInviteLink()}
                    className="mb-3 w-full rounded-lg border border-line px-3 py-1.5 text-xs text-foreground transition hover:border-ember"
                  >
                    Copy team link
                  </button>
                  {inviteNote ? <p className="mb-2 text-[11px] text-muted" role="status">{inviteNote}</p> : null}
                  <p className="bf-section-label">Invite by email</p>
                  <div className="mt-2 flex gap-2">
                    <input
                      type="email"
                      value={inviteEmail}
                      aria-label="Email address to invite"
                      onChange={(event) => setInviteEmail(event.target.value)}
                      placeholder="friend@example.com"
                      className="min-w-0 flex-1 rounded-lg border border-line bg-background px-2 py-1.5 text-sm text-foreground placeholder:text-muted"
                    />
                    <button
                      type="button"
                      onClick={() => void handleInvite()}
                      className="rounded-lg bg-ember px-3 py-1.5 text-xs font-semibold text-background"
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
          className="bf-scroller flex-1 overflow-y-auto px-6 py-6"
          onScroll={handleTranscriptScroll}
        >
          {isBooting && messages.length === 0 ? (
            <div className="py-10 text-center" role="status" aria-live="polite">
              <p className="text-sm text-muted">
                Loading your conversation…
              </p>
            </div>
          ) : !conversationId ? (
            <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col items-center justify-center text-center">
              <div
                className="bf-ai-mark flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl"
                aria-hidden="true"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- bundled local asset at a fixed size */}
                <img src="/discord-server-icon.png" alt="" className="h-full w-full object-cover" />
              </div>
              <h1 className="bf-start-title mt-5 font-serif text-3xl text-foreground sm:text-[2.6rem]">
                What are we building today?
              </h1>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">
                AI drafts it in seconds. Your team and vetted specialists take it from there.
                {isGuestBrowser ? <span className="mt-1 block text-xs">Free to start. No card, no sign-up to try it.</span> : null}
              </p>
              <AiPeopleFlow />
            </div>
          ) : (
            <>
              {hasOlder ? (
                <div className="mb-4 flex justify-center">
                  <button
                    type="button"
                    onClick={() => void loadOlderMessages()}
                    disabled={isLoadingOlder}
                    className="rounded-full border border-line px-3 py-1.5 text-xs text-muted transition hover:border-ember hover:text-foreground disabled:opacity-60"
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
                if (action === "decline") void handleProposalAction("decline");
                if (action === "counter" || action === "counter_back") {
                  void handleProposalAction(action, parseCounterTerms(value));
                }
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
              proposal={proposal}
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
              className="mx-auto max-w-3xl rounded-xl border border-trust/30 bg-trust/10 px-4 py-3 text-sm text-trust-light"
              role="status"
            >
              {commandStatus}
            </div>
          </div>
        ) : null}
        {error ? (
          <div className="px-6 pb-2">
            <div
              className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-danger"
              role="alert"
            >
              <span className="min-w-0 flex-1">{error}</span>
              {policyHit ? (
                reviewAsked ? (
                  <span className="shrink-0 text-xs">A person will take a look.</span>
                ) : (
                  <button
                    type="button"
                    className="bf-error-retry shrink-0"
                    onClick={() => {
                      setReviewAsked(true);
                      void fetchAuthed("/api/content-review", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ text: policyHit.text, category: policyHit.category, conversationId }),
                      }).catch(() => undefined);
                    }}
                  >
                    Ask a person to review
                  </button>
                )
              ) : input.trim() && !isStreaming ? (
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

        <VideoReadyBar
          count={videoImages.length}
          busy={isStreaming}
          onOpen={() => {
            trackEvent("next_step_clicked", { source: "video_ready" });
            setIsVideoOpen(true);
          }}
        />
        <GuestSaveBar
          conversationId={conversationId}
          hasReply={!isStreaming && messages.some((message) => message.sender === "ai" && !message.streaming)}
        />

        {/* Typing + who-else-is-here. One polite live region so a screen reader announces the
            change without interrupting; the animated dot is decorative. */}
        <div className="px-4 sm:px-6">
          <div
            className="mx-auto flex h-6 max-w-3xl items-center gap-2 text-xs text-muted"
            role="status"
            aria-live="polite"
          >
            {typingLabel ? (
              <>
                <span aria-hidden="true" className="flex gap-1">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ember" />
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ember [animation-delay:150ms]" />
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-ember [animation-delay:300ms]" />
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
            className="relative mx-auto max-w-3xl"
          >
            {slashMatches.length > 0 ? (
              <div
                role="listbox"
                aria-label="Slash commands"
                className="absolute inset-x-0 bottom-full z-40 mb-2 rounded-xl border border-line bg-panel p-1 shadow-xl"
              >
                {slashMatches.map((item, index) => (
                  <button
                    key={item.command}
                    type="button"
                    role="option"
                    aria-selected={index === slashHighlight}
                    className={
                      "bf-menu-item w-full text-left" +
                      (index === slashHighlight ? " bg-overlay text-foreground" : "")
                    }
                    onMouseDown={(event) => {
                      // MouseDown, not click: inserting before the textarea blurs keeps
                      // focus (and the popup) stable through the press.
                      event.preventDefault();
                      insertSlashCommand(item.command);
                    }}
                  >
                    {item.label}
                    <span className="bf-menu-hint">{item.command}</span>
                  </button>
                ))}
              </div>
            ) : null}
            {attachment ? (
              <div className="bf-composer-chip" role="status">
                <span aria-hidden="true">📄</span>
                <span className="min-w-0 flex-1 truncate">
                  {attachment.name}
                </span>
                <span className="text-[10px] text-muted">
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
              <div className="mb-2 flex items-center justify-between rounded-lg border border-ember/30 bg-panel px-3 py-2 text-xs text-foreground">
                <span>Replying to message</span>
                <button
                  type="button"
                  aria-label="Stop replying"
                  onClick={() => {
                    setIsReplyingTo(null);
                    setInput("");
                  }}
                  className="text-muted hover:text-foreground"
                >
                  ✕
                </button>
              </div>
            ) : null}
            {/* Soft lock: the brief already fired the handoff. Chat stays open — keep adding
                context — but the next move belongs to the team, not another send-for-review. */}
            {state?.status === "READY_FOR_REVIEW" && !railMeta.isStaff ? (
              <div
                className="mb-2 flex items-center gap-2 rounded-xl border border-ember/25 bg-ember/10 px-3 py-2 text-xs leading-relaxed text-ember-light"
                role="status"
              >
                <span className="bf-status-dot" aria-hidden="true" />
                <span>
                  Brief with the team — waiting for review. Keep adding context here;
                  they reply in this chat.
                </span>
              </div>
            ) : null}
            {/* Staff send side of the proposal flow: brief is waiting, an operator
                writes the offer here (POST /api/proposals). Admins see it in any chat;
                operators see it while the brief waits, before their invite lands. */}
            {railMeta.isStaff &&
            !isOwnConversation &&
            state?.status === "READY_FOR_REVIEW" ? (
              <div className="mb-2 rounded-xl border border-ember/25 bg-panel p-3">
                {/* A plain div, deliberately NOT a <form>: this strip renders inside the
                    composer <form> below and nested forms are invalid HTML — the browser
                    drops the inner form tag, which turned Submit into a native GET
                    navigation to bare /chat instead of the proposal POST. Enter in a
                    single-line field still submits via onKeyDown; the textarea keeps
                    its newlines. */}
                {showProposalForm ? (
                  <div
                    aria-label="Send proposal"
                    className="space-y-3"
                    onKeyDown={(event) => {
                      if (
                        event.key === "Enter" &&
                        (event.target as HTMLElement | null)?.tagName === "INPUT"
                      ) {
                        event.preventDefault();
                        void handleSendProposal();
                      }
                    }}
                  >
                    <p className="bf-section-label">Team proposal</p>
                    <input
                      type="text"
                      value={proposalTitle}
                      aria-label="Proposal title"
                      onChange={(event) => setProposalTitle(event.target.value)}
                      placeholder="Proposal title, e.g. CRM dashboard build"
                      maxLength={160}
                      className="w-full rounded-lg border border-line bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted"
                    />
                    <textarea
                      value={proposalScope}
                      aria-label="Technical approach"
                      onChange={(event) => setProposalScope(event.target.value)}
                      placeholder="Outline your technical stack, architecture, and implementation strategy…"
                      rows={4}
                      maxLength={4000}
                      className="w-full resize-y rounded-lg border border-line bg-background px-3 py-2 text-sm leading-relaxed text-foreground placeholder:text-muted"
                    />
                    <div className="flex gap-3">
                      <label className="flex-1 text-[10px] uppercase tracking-[0.14em] text-muted">
                        Final quote (EUR)
                        <input
                          type="number"
                          min={1}
                          step="1"
                          inputMode="decimal"
                          value={proposalQuote}
                          onChange={(event) => setProposalQuote(event.target.value)}
                          placeholder="18500"
                          className="mt-1 w-full rounded-lg border border-line bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted"
                        />
                      </label>
                      <label className="flex-1 text-[10px] uppercase tracking-[0.14em] text-muted">
                        Timeline (weeks)
                        <input
                          type="number"
                          min={1}
                          step="1"
                          inputMode="numeric"
                          value={proposalWeeks}
                          onChange={(event) => setProposalWeeks(event.target.value)}
                          placeholder="6"
                          className="mt-1 w-full rounded-lg border border-line bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted"
                        />
                      </label>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => void handleSendProposal()}
                        disabled={proposalSending}
                        className="rounded-lg bg-ember px-4 py-2 text-xs font-semibold text-background disabled:opacity-60"
                      >
                        {proposalSending ? "Sending…" : "Submit proposal"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowProposalForm(false)}
                        className="text-xs text-muted hover:text-foreground"
                      >
                        Back
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    className="flex items-center gap-2 text-xs leading-relaxed text-ember-light"
                    role="status"
                  >
                    <span className="bf-status-dot" aria-hidden="true" />
                    <span>Brief ready for review. Send your proposal to the founder.</span>
                    <button
                      type="button"
                      onClick={() => setShowProposalForm(true)}
                      className="ml-auto shrink-0 rounded-lg bg-ember px-3 py-1.5 text-xs font-semibold text-background"
                    >
                      Send proposal
                    </button>
                  </div>
                )}
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
                aria-label="Chat message"
                onChange={(event) => {
                  setInput(event.target.value);
                  setIsTyping(Boolean(event.target.value.trim()));
                  setSlashIndex(0);
                  setSlashClosed(false);
                }}
                placeholder={
                  isReplyingTo
                    ? "Type your reply…"
                    : conversationId
                      ? "Ask anything…"
                      : "Describe your idea…"
                }
                rows={1}
                disabled={isBusy}
                className="bf-composer-input"
                onKeyDown={(event) => {
                  if (slashMatches.length > 0) {
                    if (event.key === "ArrowDown") {
                      event.preventDefault();
                      setSlashIndex((i) => (i + 1) % slashMatches.length);
                      return;
                    }
                    if (event.key === "ArrowUp") {
                      event.preventDefault();
                      setSlashIndex(
                        (i) => (i - 1 + slashMatches.length) % slashMatches.length,
                      );
                      return;
                    }
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setSlashClosed(true);
                      return;
                    }
                    if (event.key === "Enter" && !event.shiftKey) {
                      const highlighted = slashMatches[slashHighlight];
                      // A complete command keeps its send-on-Enter muscle memory; a
                      // partial one completes first and sends on the next Enter.
                      const exact =
                        highlighted &&
                        highlighted.command === `/${slashQuery?.toLowerCase() ?? ""}`;
                      if (!exact && highlighted) {
                        event.preventDefault();
                        insertSlashCommand(highlighted.command);
                        return;
                      }
                    }
                  }
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void handleSend();
                  }
                }}
              />
              <div className="bf-composer-bar">
                <div className="flex items-center gap-1.5">
                  <div className="bf-menu-root relative">
                    <button
                      type="button"
                      className="bf-composer-tool"
                      aria-expanded={attachMenuOpen}
                    aria-label="Attach a file"
                      aria-haspopup="menu"
                      disabled={!conversationId}
                      data-tip={conversationId ? "Attach a file" : "Send a first message, then attach files"}
                      onClick={() => setAttachMenuOpen((value) => !value)}
                    >
                      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15.5 9.5l-5.6 5.6a3.4 3.4 0 01-4.8-4.8l6-6a2.3 2.3 0 013.2 3.2l-6 6a1.1 1.1 0 01-1.6-1.6l5.4-5.4" /></svg>
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
                      className="bf-composer-tool bf-composer-actions"
                      aria-expanded={commandsOpen}
                      aria-label="Actions"
                      data-tip="Actions: images, ads, calendar, video, team"
                      aria-haspopup="menu"
                      onClick={() => setCommandsOpen((value) => !value)}
                    >
                      <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="M10 4v12M4 10h12" /></svg>
                      <span className="bf-actions-label" aria-hidden="true">Actions</span>
                    </button>
                    {commandsOpen ? (
                      <div
                        role="menu"
                        className="bf-menu absolute bottom-full left-0 z-40 mb-2 w-64 p-1"
                      >
                        {NEXT_STEP_ACTIONS.map((item) => (
                          <button
                            key={item.key}
                            type="button"
                            role="menuitem"
                            className="bf-menu-item"
                            onClick={() => {
                              setCommandsOpen(false);
                              trackEvent("next_step_clicked", { source: item.key });
                              setInput(item.text);
                              // Cursor after the prefix so typing continues the sentence.
                              requestAnimationFrame(() => {
                                const box = composerRef.current;
                                if (!box) return;
                                box.focus();
                                box.setSelectionRange(item.text.length, item.text.length);
                              });
                            }}
                          >
                            {item.label}
                          </button>
                        ))}
                        {railMeta.userId ? (
                          <button
                            type="button"
                            role="menuitem"
                            className="bf-menu-item"
                            onClick={() => {
                              setCommandsOpen(false);
                              trackEvent("next_step_clicked", { source: "invite" });
                              setShowInviteForm(true);
                            }}
                          >
                            Invite my team
                          </button>
                        ) : null}
                        {railMeta.userId && conversationId ? (
                          <button
                            type="button"
                            role="menuitem"
                            className="bf-menu-item"
                            onClick={() => {
                              setCommandsOpen(false);
                              trackEvent("next_step_clicked", { source: "contract" });
                              setShowContractForm(true);
                            }}
                          >
                            Create a contract
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
                  <div className="flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={isBusy || (!input.trim() && !attachment)}
                    aria-label={
                      isStreaming ? "BrandForge is answering" : "Send message"
                    }
                    data-tip={isStreaming ? "Answering" : "Send"}
                    className="bf-composer-send"
                  >
                    <span aria-hidden="true">{isStreaming ? "···" : "↑"}</span>
                  </button>
                </div>
              </div>
            </div>
          </form>
          <ActionsHint show={showActionsHint} onDismiss={dismissActionsHint} />
        </div>
        {!conversationId && !isBooting ? (
          <StartPrompts
            onPick={(text) => {
              setInput(text);
              requestAnimationFrame(() => {
                const box = composerRef.current;
                if (!box) return;
                box.focus();
                box.setSelectionRange(text.length, text.length);
              });
            }}
          />
        ) : null}
        <p className="bf-chat-footer">
          AI can make mistakes. People check what matters.
          <span aria-hidden="true"> · </span>
          <Link href="/terms">Terms</Link>
          <span aria-hidden="true"> · </span>
          <Link href="/privacy">Privacy</Link>
        </p>
      </main>

      {isVideoOpen ? <VideoMaker images={videoImages} onClose={() => setIsVideoOpen(false)} /> : null}

      {isContextOpen ? (
        <ProjectContextPanel
          state={state}
          outline={answerOutline}
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
      {showContractForm && conversationId ? (
        <PeerContractForm
          conversationId={conversationId}
          onClose={() => setShowContractForm(false)}
          onSaved={() => {
            void refreshMessages(conversationId);
          }}
        />
      ) : null}
      </div>
    </div>
  );
}
