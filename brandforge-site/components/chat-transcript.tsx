'use client';

import { useState } from 'react';

export interface ChatMessage {
  id: string;
  sender: 'user' | 'ai' | 'human' | 'system';
  content: string;
  createdAt: string | null;
  editedAt?: string | null;
  streaming?: boolean;
  reactions?: { emoji: string; count: number; reactedByMe: boolean }[];
  artifactData?: { path: string; name: string; size: number; contentType: string } | null;
  /**
   * The person behind a non-AI message. Pillar A of the overhaul: no shared "BrandForge Team"
   * author anywhere - every human message is attributed to a named individual who actually
   * wrote it. `null` only for rows written before sender_name was stored.
   */
  senderName?: string | null;
  senderId?: string | null;
}

export const SUGGESTED_PROMPTS = [
  'Build a website',
  'Build an app',
  'Launch a SaaS',
  'Automate my business',
  'Build an AI product',
  'Grow my business',
  'I have an idea',
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
}: {
  label: string;
  tone: 'ember' | 'trust' | 'human';
  /** Screen-reader label: initials alone ("AL") are meaningless when read aloud. */
  author?: string;
}) {
  const toneClass =
    tone === 'ember'
      ? 'bg-[#e8571e] text-[#14171a]'
      : tone === 'trust'
        ? 'bg-[#5aa578] text-[#14171a]'
        : 'bg-[#2b3238] text-[#ece7de]';

  return (
    <div
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${toneClass}`}
      aria-hidden={author ? true : undefined}
    >
      {label}
      {author ? <span className="sr-only">{author}</span> : null}
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

export function ChatTranscript({
  messages,
  isStreaming,
  onSuggestion,
  currentUserId,
  onEditMessage,
  onDeleteMessage,
  onReact,
}: {
  messages: ChatMessage[];
  isStreaming: boolean;
  onSuggestion: (prompt: string) => void;
  currentUserId: string | null;
  onEditMessage: (id: string, content: string) => Promise<void>;
  onDeleteMessage: (id: string) => Promise<void>;
  onReact: (id: string, emoji: string) => Promise<void>;
}) {
  if (messages.length === 0) {
    return (
      <div className="mx-auto flex h-full w-full max-w-2xl flex-col items-center justify-center py-10 text-center">
        <h1 className="font-serif text-3xl text-[#ece7de] sm:text-4xl">What are you building?</h1>
        <p className="mt-4 max-w-xl text-base leading-relaxed text-[#9aa0a6]">
          Describe your idea, business, product or problem. BrandForge will ask what it needs to
          know, structure the requirements as you talk, and turn this conversation into a real
          project with a human team.
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-2">
          {SUGGESTED_PROMPTS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => onSuggestion(prompt)}
              className="rounded-full border border-white/10 bg-[#1c2024] px-4 py-2 text-sm text-[#ece7de] transition hover:border-[#e8571e]"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      {messages.map((message) => {
        if (message.sender === 'system') {
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
                  <a
                    href={`/api/attachments?path=${encodeURIComponent(message.artifactData.path)}`}
                    className="mt-2 flex items-center gap-2 rounded-xl border border-[#e8571e]/30 bg-[#14171a]/50 px-3 py-2 text-xs text-[#ece7de] hover:border-[#e8571e]"
                  >
                    <span aria-hidden="true">↗</span>
                    <span className="min-w-0 flex-1 truncate">{message.artifactData.name}</span>
                    <span className="text-[10px] text-[#9aa0a6]">{Math.ceil(message.artifactData.size / 1024)} KB</span>
                  </a>
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

            {isUser ? <Avatar label="You" tone="trust" /> : null}
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
