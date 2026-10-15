'use client';

import { createContext, useContext } from 'react';

/** The chat a creation message sits in, and whether the person looking is its owner (who may edit and publish it). */
export type CreationChat = { conversationId: string | null; isOwner: boolean; onChanged: () => void };

export const CreationChatContext = createContext<CreationChat>({ conversationId: null, isOwner: false, onChanged: () => undefined });

export function useCreationChat(): CreationChat {
  return useContext(CreationChatContext);
}
