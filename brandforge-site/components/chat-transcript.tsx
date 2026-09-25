'use client';

export interface ChatMessage {
  id: string;
  sender: 'user' | 'ai' | 'human' | 'system';
  content: string;
  createdAt: string | null;
  streaming?: boolean;
  /**
   * The person behind a non-AI message. Pillar A of the overhaul: no shared "BrandForge Team"
   * author anywhere - every human message is attributed to a named individual who actually
   * wrote it. `null` only for rows written before sender_name was stored.
   */
  senderName?: string | null;
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

export function ChatTranscript({
  messages,
  isStreaming,
  onSuggestion,
}: {
  messages: ChatMessage[];
  isStreaming: boolean;
  onSuggestion: (prompt: string) => void;
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
                {message.content}
                {message.streaming && !message.content ? (
                  <span className="inline-flex gap-1">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#9aa0a6]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#9aa0a6] [animation-delay:120ms]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[#9aa0a6] [animation-delay:240ms]" />
                  </span>
                ) : null}
              </div>
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
