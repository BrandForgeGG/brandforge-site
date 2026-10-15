'use client';

import { useCallback, useEffect, useRef } from 'react';
import { deleteDraft, getDraft, newDraftId, saveDraft, type Draft } from '@/components/drafts/drafts-store';

/**
 * A maker's draft: `load` gives back the draft it was opened on (if any), `save` keeps the latest words and settings
 * (the first save names the draft and reports its id, so the address can carry it across a refresh), `remove` forgets it
 * once it is published.
 */
export function useDraft(kind: string, draftId: string | undefined, onDraftId?: (id: string) => void) {
  const idRef = useRef<string | null>(draftId ?? null);
  const reportRef = useRef(onDraftId);
  useEffect(() => {
    reportRef.current = onDraftId;
  }, [onDraftId]);

  const load = useCallback(async (): Promise<Draft | null> => (draftId ? getDraft(draftId) : null), [draftId]);

  const save = useCallback(
    async (patch: Partial<Omit<Draft, 'id' | 'kind' | 'updatedAt'>>) => {
      if (!idRef.current) {
        idRef.current = newDraftId();
        reportRef.current?.(idRef.current);
      }
      return saveDraft({ ...patch, id: idRef.current, kind });
    },
    [kind]
  );

  const remove = useCallback(async () => {
    if (idRef.current) await deleteDraft(idRef.current);
  }, []);

  return { load, save, remove };
}

/** Calls `save` a moment after the value stops changing (typing does not write on every key). */
export function useAutosave(value: unknown, enabled: boolean, save: () => void, delay = 800): void {
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);
  const key = enabled ? JSON.stringify(value) : '';
  useEffect(() => {
    if (!enabled) return;
    const timer = window.setTimeout(() => saveRef.current(), delay);
    return () => window.clearTimeout(timer);
  }, [key, enabled, delay]);
}
