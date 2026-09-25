'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { ClientProjectState } from '@/lib/conversation-state';
import { shapeTaskRoster } from '@/lib/task-board';
import { ChatTranscript, type ChatMessage } from '@/components/chat-transcript';
import { ConversationRail, relativeTime, type RecentConversation } from '@/components/conversation-rail';
import {
  ProjectContextPanel,
  STATUS_LABELS,
  type AgreementSummary,
  type PaymentSummary,
  type ProposalSummary,
  type TaskParticipant,
} from '@/components/project-context-panel';

interface PersistedMessage {
  id: string;
  sender_type: string;
  content: string;
  content_type: string | null;
  created_at: string | null;
}

function toChatMessage(message: PersistedMessage): ChatMessage {
  const sender: ChatMessage['sender'] =
    message.sender_type === 'user'
      ? 'user'
      : message.sender_type === 'ai'
        ? message.content_type === 'system'
          ? 'system'
          : 'ai'
        : 'human';

  return {
    id: message.id,
    sender,
    content: message.content,
    createdAt: message.created_at,
  };
}

export function ChatWorkspace() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const conversationId = searchParams.get('conversationId') ?? '';

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [state, setState] = useState<ClientProjectState | null>(null);
  const [recents, setRecents] = useState<RecentConversation[]>([]);
  // Staff accounts see every conversation plus how many nobody has picked up yet.
  const [railMeta, setRailMeta] = useState<{ isStaff: boolean; unseenCount: number; userId: string | null }>({
    isStaff: false,
    unseenCount: 0,
    userId: null,
  });
  const [proposal, setProposal] = useState<ProposalSummary | null>(null);
  const [agreement, setAgreement] = useState<AgreementSummary | null>(null);
  const [payments, setPayments] = useState<PaymentSummary[]>([]);
  // Roster for the task assignee picker: people already in this chat (staff + founder).
  const [taskParticipants, setTaskParticipants] = useState<TaskParticipant[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isBooting, setIsBooting] = useState(false);
  const [isCreatingConversation, setIsCreatingConversation] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Desktop-style layout: the left rail is shown by default, the right insights panel is hidden
  // until the user asks for it. On mobile both become drawers.
  const [isRailOpen, setIsRailOpen] = useState(false);
  const [isContextOpen, setIsContextOpen] = useState(false);

  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const autoAnsweredRef = useRef<Set<string>>(new Set());

  // Reset the workspace when the conversation changes (React-endorsed render-phase pattern,
  // avoids synchronous setState inside an effect).
  const [lastConversationId, setLastConversationId] = useState(conversationId);
  if (conversationId !== lastConversationId) {
    setLastConversationId(conversationId);
    setMessages([]);
    setState(null);
    setProposal(null);
    setAgreement(null);
    setPayments([]);
    setTaskParticipants([]);
    setError(null);
  }

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      const node = scrollerRef.current;
      if (node) {
        node.scrollTop = node.scrollHeight;
      }
    });
  }, []);

  const loadRecents = useCallback(async () => {
    try {
      const response = await fetch('/api/conversations-list');
      if (!response.ok) return { isStaff: false, unseenCount: 0, userId: null, conversations: [] as RecentConversation[] };
      const data = await response.json();
      const conversations: RecentConversation[] = Array.isArray(data.conversations)
        ? data.conversations
        : [];
      setRecents(conversations);
      const meta = {
        isStaff: Boolean(data.isStaff),
        unseenCount: Number(data.unseenCount ?? 0),
        userId: typeof data.userId === 'string' ? data.userId : null,
      };
      setRailMeta(meta);
      return { ...meta, conversations };
    } catch {
      // Recents are a convenience feed; a failure must not break the conversation.
      return { isStaff: false, unseenCount: 0, userId: null, conversations: [] as RecentConversation[] };
    }
  }, []);

  const refreshMessages = useCallback(async (id: string): Promise<ChatMessage[]> => {
    const response = await fetch(`/api/messages?conversationId=${id}`);
    if (!response.ok) return [];

    const data = await response.json();
    const mapped: ChatMessage[] = (Array.isArray(data.messages) ? data.messages : []).map(toChatMessage);
    setMessages(mapped);

    return mapped;
  }, []);

  const refreshState = useCallback(async (id: string): Promise<ClientProjectState | null> => {
    const response = await fetch(`/api/project-context?conversationId=${id}`);
    if (!response.ok) return null;

    const data = await response.json();
    setState(data.state ?? null);

    return (data.state ?? null) as ClientProjectState | null;
  }, []);

  const refreshArtifacts = useCallback(async (id: string) => {
    const [proposalResult, agreementResult, participantsResult] = await Promise.all([
      fetch(`/api/proposals?conversationId=${id}`),
      fetch(`/api/agreements?conversationId=${id}`),
      fetch(`/api/participants?conversationId=${id}`),
    ]);

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
      setError(null);
      setIsStreaming(true);

      const assistantMessageId = `local-ai-${Date.now()}`;
      const now = new Date().toISOString();

      if (message) {
        setMessages((prev) => [
          ...prev,
          { id: `local-user-${Date.now()}`, sender: 'user', content: message, createdAt: now },
        ]);
      }

      setMessages((prev) => [
        ...prev,
        { id: assistantMessageId, sender: 'ai', content: '', createdAt: now, streaming: true },
      ]);
      scrollToBottom();

      let streamedText = '';
      let succeeded = false;

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversationId: id, ...(message ? { message } : {}) }),
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          throw new Error(payload.error || 'BrandForge AI could not answer');
        }

        const reader = response.body?.getReader();

        if (!reader) {
          throw new Error('The response stream could not be read');
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split('\n\n');
          buffer = frames.pop() ?? '';

          for (const frame of frames) {
            const line = frame.split('\n').find((entry) => entry.startsWith('data:'));
            if (!line) continue;

            let payload: { type?: string; chunk?: string; error?: string; state?: ClientProjectState };
            try {
              payload = JSON.parse(line.slice(5).trim());
            } catch {
              continue;
            }

            if (payload.type === 'delta' && typeof payload.chunk === 'string') {
              streamedText += payload.chunk;
              setMessages((prev) =>
                prev.map((entry) =>
                  entry.id === assistantMessageId ? { ...entry, content: streamedText } : entry
                )
              );
              scrollToBottom();
            } else if (payload.type === 'state' && payload.state) {
              setState(payload.state);
            } else if (payload.type === 'error') {
              throw new Error(payload.error || 'BrandForge AI could not answer');
            }
          }
        }

        succeeded = true;
        await refreshMessages(id);
        await loadRecents();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'BrandForge AI could not answer');
        setMessages((prev) => prev.filter((entry) => entry.id !== assistantMessageId));
        // Never show a fabricated answer: reload reality and hand the text back for a retry.
        if (message) {
          setInput((current) => (current ? current : message));
        }
        await refreshMessages(id).catch(() => undefined);
      } finally {
        setIsStreaming(false);
        scrollToBottom();
      }

      if (succeeded) {
        await refreshState(id);
      }
    },
    [loadRecents, refreshMessages, refreshState, scrollToBottom]
  );

  useEffect(() => {
    // Initial Recents load: loadRecents is async and only sets state after a fetch resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadRecents();
  }, [loadRecents]);

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

      const [meta, loadedMessages] = await Promise.all([
        loadRecents(),
        refreshMessages(conversationId),
        refreshState(conversationId),
        refreshArtifacts(conversationId),
      ]);

      if (cancelled) return;

      setIsBooting(false);
      scrollToBottom();

      const lastMessage = loadedMessages[loadedMessages.length - 1];

      // Staff observe founders' histories: the AI never answers on a founder's behalf. In a
      // chat the staff member owns, they get the founder experience and the AI answers.
      const isOwn = Boolean(
        meta.userId &&
          meta.conversations.some(
            (conversation) => conversation.id === conversationId && conversation.ownerId === meta.userId
          )
      );

      if (
        (!meta.isStaff || isOwn) &&
        lastMessage &&
        lastMessage.sender === 'user' &&
        !autoAnsweredRef.current.has(conversationId)
      ) {
        autoAnsweredRef.current.add(conversationId);
        await runTurn(conversationId);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [conversationId, loadRecents, refreshArtifacts, refreshMessages, refreshState, runTurn, scrollToBottom]);

  // New Chat is the landing view, not a stored row: the conversation is created by the first
  // message (handleSend), so no empty duplicate ever shows up in Recents.
  const handleNewChat = useCallback(() => {
    setError(null);
    router.push('/chat');
  }, [router]);

  const handleDeleteConversation = useCallback(
    async (id: string) => {
      setError(null);

      try {
        const response = await fetch('/api/conversations', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversationId: id }),
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data.error || 'The conversation could not be deleted');
        }

        setRecents((current) => current.filter((conversation) => conversation.id !== id));

        if (id === conversationId) {
          router.push('/chat');
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'The conversation could not be deleted');
      }
    },
    [conversationId, router]
  );

  // Staff act as the team only inside chats owned by somebody else. A chat a staff member owns
  // is their own project: it behaves like any founder's chat (AI answers, founder actions).
  const isOwnConversation = Boolean(
    conversationId &&
      railMeta.userId &&
      recents.some(
        (conversation) => conversation.id === conversationId && conversation.ownerId === railMeta.userId
      )
  );

  const handleSend = useCallback(
    async (suggestion?: string) => {
      const text = (suggestion ?? input).trim();

      if (!text || isStreaming) {
        return;
      }

      setInput('');

      // BrandForge staff reply as the team (human_operator) inside a founder chat instead of
      // triggering the AI, so the founder always sees a human voice in the same chat. Sending
      // without an open chat falls through to the creation path below - staff can start one too.
      if (railMeta.isStaff && conversationId && !isOwnConversation) {
        setIsStreaming(true);

        try {
          const response = await fetch('/api/staff/post', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ conversationId, message: text }),
          });
          const data = await response.json().catch(() => ({}));

          if (!response.ok) {
            throw new Error(data.error || 'The message could not be sent');
          }

          await refreshMessages(conversationId);
          await loadRecents();
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : 'The message could not be sent');
          setInput(text);
        } finally {
          setIsStreaming(false);
          scrollToBottom();
        }

        return;
      }

      if (!conversationId) {
        // Someone opened /chat directly: the first message creates the project.
        setIsCreatingConversation(true);

        try {
          const response = await fetch('/api/conversations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ initialMessage: text }),
          });
          const data = await response.json().catch(() => ({}));

          if (!response.ok || !data.conversationId) {
            throw new Error(data.error || 'Could not start your project');
          }

          router.push(`/chat?conversationId=${data.conversationId}`);
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : 'Could not start your project');
          setInput(text);
        } finally {
          setIsCreatingConversation(false);
        }

        return;
      }

      await runTurn(conversationId, text);
    },
    [conversationId, input, isOwnConversation, isStreaming, loadRecents, railMeta.isStaff, refreshMessages, router, runTurn, scrollToBottom]
  );

  // BrandForge staff: opening a chat IS picking it up. The join call registers the participant row
  // and leaves the founder-visible "joined this conversation" message, so the user can see the
  // team has arrived. Founders never trigger it (the route rejects the owner).
  const pickedUpRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!conversationId || !railMeta.isStaff || isOwnConversation || pickedUpRef.current.has(conversationId)) {
      return;
    }

    pickedUpRef.current.add(conversationId);

    void (async () => {
      try {
        await fetch('/api/staff/join', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversationId }),
        });
        await loadRecents();
      } catch {
        // Best effort: the chat still renders if the join call fails.
      }
    })();
  }, [conversationId, isOwnConversation, loadRecents, railMeta.isStaff]);

  const handleRequestReview = useCallback(async () => {
    if (!conversationId) return;

    setBusyAction('review');
    setError(null);

    try {
      const response = await fetch('/api/request-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || 'Could not send the requirements for review');
      }

      await Promise.all([
        refreshState(conversationId),
        refreshMessages(conversationId),
        loadRecents(),
      ]);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Could not send the requirements for review'
      );
    } finally {
      setBusyAction(null);
    }
  }, [conversationId, loadRecents, refreshMessages, refreshState]);

  const handleProposalAction = useCallback(
    async (action: 'accept' | 'decline' | 'request_changes') => {
      if (!conversationId || !proposal) return;

      setBusyAction(action);
      setError(null);

      try {
        const status =
          action === 'accept' ? 'accepted' : action === 'decline' ? 'declined' : 'changes_requested';

        const response = await fetch('/api/proposals', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ proposalId: proposal.id, status }),
        });

        if (!response.ok) {
          throw new Error('The proposal could not be updated');
        }

        if (action === 'accept') {
          await fetch('/api/agreements', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              conversationId,
              proposalId: proposal.id,
              terms: `BrandForge project agreement for ${proposal.title}. Total ${proposal.currency} ${proposal.total_amount}. Estimated delivery ${proposal.estimated_weeks_min ?? '?'}-${proposal.estimated_weeks_max ?? '?'} weeks.`,
              totalAmount: proposal.total_amount,
            }),
          });
        }

        await Promise.all([
          refreshArtifacts(conversationId),
          refreshState(conversationId),
          refreshMessages(conversationId),
        ]);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'The proposal could not be updated');
      } finally {
        setBusyAction(null);
      }
    },
    [conversationId, proposal, refreshArtifacts, refreshMessages, refreshState]
  );

  // Task status transitions from inside the chat. Founder sees accept/send-back on delivered
  // work; the endpoint enforces staff rules server-side.
  const handleTaskAction = useCallback(
    async (
      taskId: string,
      payload: { action?: string; status?: string; assigneeId?: string; dueDate?: string | null }
    ) => {
      if (!conversationId) return;

      setBusyAction(`task-${taskId}`);
      setError(null);

      try {
        const response = await fetch('/api/chat-tasks', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ taskId, ...payload }),
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data.error || 'Could not update the task');
        }

        await Promise.all([
          refreshState(conversationId),
          refreshMessages(conversationId),
          refreshArtifacts(conversationId),
        ]);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Could not update the task');
      } finally {
        setBusyAction(null);
      }
    },
    [conversationId, refreshArtifacts, refreshMessages, refreshState]
  );

  // Funding is real now: the founder pastes the crypto transaction hash after sending to the
  // BrandForge deposit wallet; staff verify it on-chain before the agreement turns funded.
  const handleSubmitPayment = useCallback(
    async (txHash: string) => {
      if (!conversationId || !agreement) return;

      setBusyAction('fund');
      setError(null);

      try {
        const response = await fetch('/api/payments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agreementId: agreement.id, txHash }),
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data.error || 'The payment could not be submitted');
        }

        await Promise.all([
          refreshArtifacts(conversationId),
          refreshState(conversationId),
          refreshMessages(conversationId),
        ]);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'The payment could not be submitted');
      } finally {
        setBusyAction(null);
      }
    },
    [agreement, conversationId, refreshArtifacts, refreshMessages, refreshState]
  );

  // Staff money actions: verify the transfer on-chain, reject it, or release a milestone
  // payment to the operator after founder approval.
  const handlePaymentAction = useCallback(
    async (payload: { action: 'verify' | 'reject' | 'release'; paymentId?: string; note?: string }) => {
      if (!conversationId || !agreement) return;

      setBusyAction(payload.action === 'release' ? `release-${payload.paymentId}` : payload.action);
      setError(null);

      try {
        const response = await fetch('/api/payments', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agreementId: agreement.id, ...payload }),
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data.error || 'The payment action failed');
        }

        await Promise.all([
          refreshArtifacts(conversationId),
          refreshState(conversationId),
          refreshMessages(conversationId),
        ]);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'The payment action failed');
      } finally {
        setBusyAction(null);
      }
    },
    [agreement, conversationId, refreshArtifacts, refreshMessages, refreshState]
  );

  const projectLabel = state?.project.name || state?.title || 'New project';
  const isBusy = isStreaming || isCreatingConversation;
  // The active row from Recents carries the staff marker; staff never delete founder chats here.
  const activeConversation =
    recents.find((conversation) => conversation.id === conversationId) ?? null;
  const canDeleteConversation = Boolean(conversationId) && (!railMeta.isStaff || isOwnConversation);

  return (
    <div className="flex h-screen overflow-hidden bg-[#14171a] text-[#ece7de]">
      <ConversationRail
        recents={recents}
        activeConversationId={conversationId}
        onNewChat={handleNewChat}
        isCreatingConversation={isCreatingConversation}
        isMobileOpen={isRailOpen}
        onMobileClose={() => setIsRailOpen(false)}
        isStaff={railMeta.isStaff}
        staffUnseenCount={railMeta.unseenCount}
        onConversationDeleted={(id) => {
          void handleDeleteConversation(id);
        }}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-white/10 px-4 py-4 sm:px-6">
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
              <h1 className="truncate font-serif text-xl text-[#ece7de]">{projectLabel}</h1>
              {activeConversation?.staffViewedBy ? (
                <p className="mt-1 truncate text-xs text-[#5aa578]">
                  BrandForge team in chat · {activeConversation.staffViewedBy}
                  {activeConversation.staffViewedAt
                    ? ' · ' + relativeTime(activeConversation.staffViewedAt)
                    : ''}
                </p>
              ) : state?.project.problemStatement ? (
                <p className="mt-1 truncate text-xs text-[#9aa0a6]">{state.project.problemStatement}</p>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden rounded-full border border-white/10 px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-[#9aa0a6] sm:inline">
              {state ? STATUS_LABELS[state.status] ?? state.status : 'Discovery'}
            </span>
            {canDeleteConversation ? (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('Delete this chat? The project, proposal and messages go with it.')) {
                    void handleDeleteConversation(conversationId);
                  }
                }}
                className="rounded-lg border border-white/10 px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-[#9aa0a6] transition hover:border-red-400/40 hover:text-red-200"
              >
                Delete
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setIsContextOpen((value) => !value)}
              className={
                'rounded-lg border px-3 py-2 text-[10px] uppercase tracking-[0.2em] transition ' +
                (isContextOpen
                  ? 'border-[#e8571e]/50 text-[#ece7de]'
                  : 'border-white/10 text-[#9aa0a6] hover:border-[#e8571e] hover:text-[#ece7de]')
              }
              aria-label={isContextOpen ? 'Hide project insights' : 'Show project insights'}
            >
              {isContextOpen ? 'Hide insights' : 'Insights'}
            </button>
          </div>
        </header>

        <div ref={scrollerRef} className="flex-1 overflow-y-auto px-6 py-6">
          {isBooting && messages.length === 0 ? (
            <p className="py-10 text-center text-sm text-[#9aa0a6]">Loading your conversation…</p>
          ) : (
            <ChatTranscript
              messages={messages}
              isStreaming={isStreaming}
              onSuggestion={(prompt) => {
                void handleSend(prompt);
              }}
            />
          )}
        </div>

        {error ? (
          <div className="px-6 pb-2">
            <div className="mx-auto max-w-3xl rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {error}
            </div>
          </div>
        ) : null}

        <div className="sticky bottom-0 shrink-0 border-t border-white/10 bg-[#14171a] px-4 py-4 sm:px-6">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void handleSend();
            }}
            className="mx-auto max-w-3xl"
          >
            <div className="relative">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder={conversationId ? 'Ask anything…' : 'Describe what you want to build…'}
                rows={2}
                disabled={isBusy}
                className="w-full resize-none rounded-2xl border border-white/10 bg-[#1c2024] px-4 py-3 pr-14 text-sm text-[#ece7de] outline-none transition placeholder:text-[#6f757b] focus:border-[#e8571e] disabled:opacity-60"
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void handleSend();
                  }
                }}
              />
              <button
                type="submit"
                disabled={isBusy || !input.trim()}
                className="absolute bottom-3 right-3 rounded-lg bg-[#e8571e] px-3 py-1.5 text-sm font-semibold text-[#14171a] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isStreaming ? '···' : '↑'}
              </button>
            </div>
            <p className="mt-2 text-center text-[10px] uppercase tracking-[0.2em] text-[#6f757b]">
              AI estimate only · a human BrandForge proposal follows review
            </p>
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
  );
}