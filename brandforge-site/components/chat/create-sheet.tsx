'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { StudioHub, type StudioKind } from '@/components/studio/studio-hub';

// The maker, inside the chat. The same cards, editor and downloads as the Create page, in a sheet that
// slides over the conversation, so nobody has to leave the chat to make, edit or download something.
export function CreateSheet({ kind, topic, onClose }: { kind: StudioKind | null; topic: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (typeof document === 'undefined') return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end bg-foreground/50" role="dialog" aria-modal="true" aria-label="Make something">
      <button type="button" className="hidden flex-1 cursor-default md:block" aria-label="Close" tabIndex={-1} onClick={onClose} />
      <div className="flex h-full w-full flex-col bg-background md:max-w-3xl md:border-l md:border-line">
        <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-3">
          <p className="font-serif text-lg text-foreground">Make something</p>
          <button type="button" onClick={onClose} className="rounded-lg border border-line px-3 py-1.5 text-sm text-foreground transition hover:border-ember">
            Back to chat
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-6">
          <StudioHub embedded initialKind={kind} initialTopic={topic} />
        </div>
      </div>
    </div>,
    document.body,
  );
}
