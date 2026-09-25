'use client';

import { useState } from 'react';
import { embedActions, showsFundingForm } from '@/lib/embed-actions.js';

export type ChatEmbedAction = 'accept' | 'details' | 'submit_funding';

export type ChatEmbed =
  | { type: 'proposal'; proposalId: string; status: string; title?: string }
  | { type: 'agreement'; agreementId: string; status: string }
  | { type: 'review_request'; conversationId: string }
  | { type: 'funding'; agreementId: string; paymentId?: string; status?: string };

export interface ChatMessage {
  id: string;
  sender: 'user' | 'ai' | 'human' | 'system';
  content: string;
  createdAt: string | null;
  editedAt?: string | null;
  streaming?: boolean;
  reactions?: { emoji: string; count: number; reactedByMe: boolean }[];
  artifactData?: { path: string; name: string; size: number; contentType: string } | null;
  embed?: ChatEmbed | null;
  /**
   * The person behind a non-AI message. Pillar A of the overhaul: no shared "BrandForge Team"
   * author anywhere - every human message is attributed to a named individual who actually
   * wrote it. `null` only for rows written before sender_name was stored.
   */
  senderName?: string | null;
  senderId?: string | null;
}

export function FundingForm({ messageId, disabled, onSubmit }: { messageId: string; disabled?: boolean; onSubmit: (txHash: string) => void }) {
  const [txHash, setTxHash] = useState('');
  return (
    <form
      className="mt-3 flex w-full flex-wrap gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const value = txHash.trim();
        if (!value) return;
        onSubmit(value);
        setTxHash('');
      }}
    >
      <label className="sr-only" htmlFor={`funding-${messageId}`}>Transaction hash</label>
      <input
        id={`funding-${messageId}`}
        value={txHash}
        onChange={(event) => setTxHash(event.target.value)}
        placeholder="Paste your transaction hash"
        disabled={disabled}
        className="min-w-0 flex-1 rounded-lg border border-white/10 bg-[#14171a] px-3 py-1.5 text-xs text-[#ece7de] placeholder:text-[#6f757b] disabled:opacity-60"
      />
      <button type="submit" disabled={disabled || !txHash.trim()} className="rounded-lg bg-[#e8571e] px-3 py-1.5 text-xs font-semibold text-[#14171a] disabled:opacity-60">Submit for verification</button>
    </form>
  );
}

// Example starters for a first-timer. These deliberately read like a real, well-formed first
// message rather than a bare category ("Build a website"), because a newcomer needs to see the
// shape of a good opening before writing one. Tapping a chip sends it verbatim as the first message.
export const SUGGESTED_PROMPTS = [
  'I run a small bakery and I want a website that takes online orders and shows our daily specials. I have photos and a logo already, and I need it live before the end of next month.',
  'We keep missing support tickets because they arrive by email. I want a simple internal tool where my team can log a ticket, assign it, and see what is still open.',
  'I want to launch a small SaaS that turns customer feedback into a prioritised roadmap. I have a prototype in a spreadsheet, but I do not know the right stack or what to build first.',
];

/**
 * Two-letter initials for a person's name, so each staff member gets their own avatar
 * instead of a shared "BF". Handles single names and multi-part names ("Ada Lovelace"
 * -> "AL", "cher" -> "CH"); falls back to "?" when there is nothing to derive from.
 */
function initialsFor(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) {
    return '?';
  }

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function Avatar({
  label,
  tone,
  author,
  userId,
  conversationId,
}: {
  label: string;
  tone: 'ember' | 'trust' | 'human';
  author?: string;
  userId?: string | null;
  conversationId?: string;
}) {
  const toneClass =
    tone === 'ember'
      ? 'bg-[#e8571e] text-[#14171a]'
      : tone === 'trust'
        ? 'bg-[#5aa578] text-[#14171a]'
        : 'bg-[#2b3238] text-[#ece7de]';

  const [profile, setProfile] = useState<{ displayId: number | null; username: string | null; displayName: string | null; role: string | null } | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  async function openProfile() {
    if (!userId || !conversationId || profile) { setShowProfile(true); return; }
    setShowProfile(true);
    const response = await fetch(`/api/profile-card?conversationId=${encodeURIComponent(conversationId)}&userId=${encodeURIComponent(userId)}`);
    if (response.ok) { const data = await response.json(); setProfile(data.identity); }
  }

  return (
    <div className="relative" onMouseEnter={() => void openProfile()} onFocus={() => void openProfile()}>
      <div
        className={`bf-avatar flex h-8 w-8 shrink-0 cursor-help items-center justify-center rounded-full text-xs font-semibold ${toneClass}`}
        tabIndex={userId ? 0 : undefined}
        aria-label={author ? `View ${author}'s profile` : undefined}
        aria-hidden={author ? undefined : true}
      >
        {label}
        {author ? <span className="sr-only">{author}</span> : null}
      </div>
      {showProfile && userId ? (
        <div role="dialog" aria-label={`${author || 'Profile'} details`} className="bf-profile-card absolute bottom-10 left-0 z-30 w-52 rounded-xl border border-white/15 bg-[#111417] p-3 text-left shadow-2xl">
          {profile ? (
            <>
              <p className="text-sm font-medium text-[#ece7de]">{profile.displayName || author || 'Member'}</p>
              <p className="mt-1 text-xs text-[#9aa0a6]">{profile.displayId ? `#${profile.displayId}` : 'Member'}{profile.username ? ` · @${profile.username}` : ''}</p>
              {profile.role ? <p className="mt-1 text-[10px] uppercase tracking-[0.15em] text-[#b8763b]">{profile.role}</p> : null}
            </>
          ) : <p className="text-xs text-[#9aa0a6]">Loading profile…</p>}
        </div>
      ) : null}
    </div>
  );
}

const REACTION_EMOJI = ['👍', '❤️', '🎉', '👀'] as const;

function MessageActions({
  message,
  canManage,
  onEdit,
  onDelete,
  onReact,
}: {
  message: ChatMessage;
  canManage: boolean;
  onEdit: (content: string) => Promise<void>;
  onDelete: () => Promise<void>;
  onReact: (emoji: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5">
      {REACTION_EMOJI.map((emoji) => {
        const reaction = message.reactions?.find((entry) => entry.emoji === emoji);
        if (!reaction) return null;
        return (
          <button key={emoji} type="button" disabled={busy} onClick={() => void run(() => onReact(emoji))}
            className="rounded-full border border-white/10 px-2 py-0.5 text-xs hover:border-[#e8571e]">
            {emoji} {reaction.count}
          </button>
        );
      })}
      <button type="button" disabled={busy} aria-label="React with thumbs up"
        onClick={() => void run(() => onReact('👍'))} className="rounded px-1.5 py-0.5 text-xs text-[#9aa0a6] hover:bg-white/5">
        +👍
      </button>
      {canManage ? (
        <>
          <button type="button" disabled={busy} onClick={() => setEditing((value) => !value)}
            className="rounded px-1.5 py-0.5 text-xs text-[#9aa0a6] hover:bg-white/5">Edit</button>
          <button type="button" disabled={busy} onClick={() => void run(onDelete)}
            className="rounded px-1.5 py-0.5 text-xs text-[#9aa0a6] hover:bg-white/5">Delete</button>
        </>
      ) : null}
      {editing ? (
        <div className="mt-1 flex w-full gap-2">
          <input value={draft} onChange={(event) => setDraft(event.target.value)} maxLength={8000}
            className="min-w-0 flex-1 rounded-lg border border-white/15 bg-[#14171a] px-2 py-1.5 text-sm text-[#ece7de]" />
          <button type="button" disabled={busy || !draft.trim()} onClick={() => void run(async () => { await onEdit(draft); setEditing(false); })}
            className="rounded-lg bg-[#e8571e] px-3 py-1.5 text-xs font-semibold text-[#14171a]">Save</button>
        </div>
      ) : null}
    </div>
  );
}

// First-run orientation for a brand-new chat. This is static product copy, not an AI reply and
// not a message row: nothing here is persisted, nothing is attributed to a person, and it never
// enters the AI suggestion/approval queue. A new project starts in DISCOVERY, so the rail opens on
// "Describe" and every later stage is visibly still ahead of the founder.
const PROJECT_STAGES = [
  { key: 'describe', label: 'Describe', hint: 'Tell us what you want built' },
  { key: 'proposal', label: 'Proposal', hint: 'A specialist reviews and prices it' },
  { key: 'fund', label: 'Fund', hint: 'You approve, then fund into escrow' },
  { key: 'deliver', label: 'Deliver', hint: 'Work is built and milestone-released' },
] as const;

function FirstRunRail() {
  return (
    <ol className="mt-8 grid w-full max-w-xl grid-cols-2 gap-2 sm:grid-cols-4" aria-label="How a BrandForge project progresses">
      {PROJECT_STAGES.map((stage, index) => (
        <li key={stage.key} className="rounded-xl border border-white/10 bg-[#1c2024] p-3 text-left">
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ${
                index === 0 ? 'bg-[#e8571e] text-[#14171a]' : 'border border-white/15 text-[#6f757b]'
              }`}
            >
              {index + 1}
            </span>
            <span className={`text-xs font-semibold ${index === 0 ? 'text-[#ece7de]' : 'text-[#9aa0a6]'}`}>
              {stage.label}
            </span>
            {index === 0 ? <span className="sr-only">(current stage)</span> : null}
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-[#6f757b]">{stage.hint}</p>
        </li>
      ))}
    </ol>
  );
}

export function ChatTranscript({
  messages,
  isStreaming,
  onSuggestion,
  currentUserId,
  onEditMessage,
  onDeleteMessage,
  onReact,
  conversationId,
  onEmbedAction,
  embedBusy,
  canDecide,
}: {
  messages: ChatMessage[];
  isStreaming: boolean;
  onSuggestion: (prompt: string) => void;
  currentUserId: string | null;
  onEditMessage: (id: string, content: string) => Promise<void>;
  onDeleteMessage: (id: string) => Promise<void>;
  onReact: (id: string, emoji: string) => Promise<void>;
  conversationId: string;
  onEmbedAction?: (embed: ChatEmbed, action: ChatEmbedAction, value?: string) => void;
  embedBusy?: boolean;
  /**
   * Only the founder who owns the project may accept a proposal or submit funding. Staff reading
   * someone else's chat see the same card as read-only context instead of a button that the
   * server will reject with 403.
   */
  canDecide?: boolean;
}) {
  if (messages.length === 0) {
    return (
      <div className="mx-auto flex h-full w-full max-w-2xl flex-col items-center justify-center py-10 text-center">
        <h1 className="font-serif text-3xl text-[#ece7de] sm:text-4xl">What are you building?</h1>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-[#9aa0a6]">
          Tell me what you want built — a few sentences is enough to start. Share the problem and who
          it is for, and I will turn it into requirements you can correct as we talk.
        </p>
        <p className="mt-3 max-w-xl text-xs leading-relaxed text-[#6f757b]">
          Your first message creates the project. A BrandForge specialist then reviews it in this same
          chat and sends a priced proposal you can accept, decline, or send back with changes. Nothing
          is charged before you approve a proposal, and your money is held in escrow until you approve
          delivered work.
        </p>

        <FirstRunRail />

        <div className="mt-8 flex w-full max-w-2xl flex-col gap-2">
          <p className="text-[10px] uppercase tracking-[0.18em] text-[#6f757b]">Or start from an example</p>
          <div className="flex flex-col gap-2">
            {SUGGESTED_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => onSuggestion(prompt)}
                className="rounded-xl border border-white/10 bg-[#1c2024] px-4 py-3 text-left text-sm leading-relaxed text-[#ece7de] transition hover:border-[#e8571e]"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      {messages.map((message) => {
        if (message.sender === 'system') {
          if (message.embed) {
            const embed = message.embed;
            return (
              <div key={message.id} className="flex justify-center">
                <div className="w-full max-w-xl rounded-2xl border border-[#e8571e]/30 bg-[#1c2024] p-4 text-left">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-[#b8763b]">Project action</p>
                  <p className="mt-1 font-medium text-[#ece7de]">
                    {embed.type === 'proposal' ? embed.title || 'Proposal ready' : embed.type === 'agreement' ? 'Agreement ready' : embed.type === 'funding' ? 'Funding action' : 'Review request'}
                  </p>
                  <p className="mt-1 text-xs text-[#9aa0a6]">{message.content}</p>

                  {showsFundingForm(embed, canDecide) ? (
                    <FundingForm
                      messageId={message.id}
                      disabled={embedBusy}
                      onSubmit={(txHash) => onEmbedAction?.(embed, 'submit_funding', txHash)}
                    />
                  ) : null}

                  {/* A review_request is written after the handoff succeeds, so it is a receipt. */}
                  {embed.type === 'review_request' ? (
                    <p className="mt-3 text-xs text-[#9aa0a6]">
                      Sent to the team — they will reply in this chat.
                    </p>
                  ) : null}

                  <div className="mt-3 flex flex-wrap gap-2">
                    {/* Which controls appear is decided by the tested embed-actions module. */}
                    {embedActions({ embed, canDecide }).map((item) =>
                      item.action === 'details' ? (
                        <button
                          key={item.action}
                          type="button"
                          onClick={() => onEmbedAction?.(embed, 'details')}
                          className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-[#ece7de]"
                        >
                          {item.label}
                        </button>
                      ) : (
                        <button
                          key={item.action}
                          type="button"
                          disabled={embedBusy}
                          onClick={() => onEmbedAction?.(embed, item.action)}
                          className="rounded-lg bg-[#e8571e] px-3 py-1.5 text-xs font-semibold text-[#14171a] disabled:opacity-60"
                        >
                          {item.label}
                        </button>
                      )
                    )}
                  </div>
                </div>
              </div>
            );
          }
          return (
            <div key={message.id} className="flex justify-center">
              <p className="rounded-full border border-[#5aa578]/30 bg-[#5aa578]/10 px-4 py-2 text-center text-xs leading-relaxed text-[#d9f7ea]">
                {message.content}
              </p>
            </div>
          );
        }

        const isUser = message.sender === 'user';
        const isHuman = message.sender === 'human';

        // Pillar A: a human message is always a named person. Older rows stored before
        // sender_name existed fall back to a neutral word rather than inventing a team identity.
        const authorName = message.senderName?.trim() || (isHuman ? 'BrandForge' : '');
        const authorInitials = initialsFor(authorName);

        return (
          <div key={message.id} className={`flex gap-4 ${isUser ? 'justify-end' : 'justify-start'}`}>
            {!isUser ? (
              <Avatar
                label={isHuman ? authorInitials : 'AI'}
                tone={isHuman ? 'human' : 'ember'}
              />
            ) : null}

            <div className={`max-w-2xl ${isUser ? 'order-first' : ''}`}>
              {isHuman ? (
                <p className="mb-1 text-xs font-medium tracking-wide text-[#b8763b]">
                  {authorName}
                </p>
              ) : null}
              <div
                className={`whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  isUser
                    ? 'bg-[#e8571e] text-[#14171a]'
                    : 'border border-white/10 bg-[#1c2024] text-[#ece7de]'
                }`}
              >
                {message.artifactData ? (
                  <div className="mb-2">
                     {message.artifactData.contentType?.startsWith('audio/') ? (
                       <audio controls preload="none" className="mb-2 w-full max-w-sm" aria-label={`Audio attachment ${message.artifactData.name}`}>
                         <source src={`/api/attachments?path=${encodeURIComponent(message.artifactData.path)}`} type={message.artifactData.contentType} />
                       </audio>
                     ) : null}
                    {message.artifactData.contentType?.startsWith('image/') ? (
                       // Attachments stream from the authenticated /api/attachments route with a
                       // runtime path, so next/image optimization would drop the session check.
                       // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/api/attachments?path=${encodeURIComponent(message.artifactData.path)}`}
                        alt={message.artifactData.name}
                        className="mb-2 max-h-64 max-w-full rounded-xl border border-white/10 object-contain"
                      />
                    ) : null}
                    <a
                      href={`/api/attachments?path=${encodeURIComponent(message.artifactData.path)}`}
                      className="flex items-center gap-2 rounded-xl border border-[#e8571e]/30 bg-[#14171a]/50 px-3 py-2 text-xs text-[#ece7de] hover:border-[#e8571e]"
                    >
                    <span aria-hidden="true">↗</span>
                    <span className="min-w-0 flex-1 truncate">{message.artifactData.name}</span>
                      <span className="text-[10px] text-[#9aa0a6]">{Math.ceil(message.artifactData.size / 1024)} KB</span>
                    </a>
                  </div>
                ) : null}
                {message.content}
                {message.editedAt ? <span className={isUser ? 'ml-2 text-[10px] opacity-60' : 'ml-2 text-[10px] text-[#9aa0a6]'}>edited</span> : null}
                {message.streaming && !message.content ? (
                  <span className="inline-flex gap-1">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#9aa0a6]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#9aa0a6] [animation-delay:120ms]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#9aa0a6] [animation-delay:240ms]" />
                  </span>
                ) : null}
              </div>
              <MessageActions
                message={message}
                canManage={Boolean(currentUserId && message.senderId === currentUserId)}
                onEdit={(content) => onEditMessage(message.id, content)}
                onDelete={() => onDeleteMessage(message.id)}
                onReact={(emoji) => onReact(message.id, emoji)}
              />
            </div>

            {isUser ? <Avatar label="You" tone="trust" userId={message.senderId} conversationId={conversationId} /> : null}
          </div>
        );
      })}

      {isStreaming && !messages.some((message) => message.streaming) ? (
        <div className="flex gap-4">
          <Avatar label="AI" tone="ember" />
          <div className="rounded-2xl border border-white/10 bg-[#1c2024] px-4 py-3">
            <span className="inline-flex gap-1">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#9aa0a6]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#9aa0a6] [animation-delay:120ms]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#9aa0a6] [animation-delay:240ms]" />
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
