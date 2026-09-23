'use client';

export interface ChatMessage {
  id: string;
  sender: 'user' | 'ai' | 'human' | 'system';
  content: string;
  createdAt: string | null;
  streaming?: boolean;
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

function Avatar({ label, tone }: { label: string; tone: 'ember' | 'trust' | 'human' }) {
  const toneClass =
    tone === 'ember'
      ? 'bg-[#e8571e] text-[#14171a]'
      : tone === 'trust'
        ? 'bg-[#5aa578] text-[#14171a]'
        : 'bg-[#2b3238] text-[#ece7de]';

  return (
    <div
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${toneClass}`}
    >
      {label}
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

        return (
          <div key={message.id} className={`flex gap-4 ${isUser ? 'justify-end' : 'justify-start'}`}>
            {!isUser ? (
              <Avatar
                label={isHuman ? 'BF' : 'AI'}
                tone={isHuman ? 'human' : 'ember'}
              />
            ) : null}

            <div className={`max-w-2xl ${isUser ? 'order-first' : ''}`}>
              {isHuman ? (
                <p className="mb-1 text-[10px] uppercase tracking-[0.2em] text-[#b8763b]">
                  BrandForge team
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
