import type { User } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import {
  addMessage,
  addParticipant,
  getConversation,
  getParticipants,
  getProfileRole,
  hasAcceptedProposalFrom,
} from '@/lib/project-db';
import { getActorName, getAuthenticatedUser } from '@/lib/supabase-server';

// Staff access = profiles.role is operator or admin. Nothing else opens /api/staff/*:
// owning the conversation or merely being a participant in it does not (H4) — the client
// only calls these routes for real staff anyway.
// Shared helpers for /api/staff/*.

export interface StaffContext {
  user: User;
  conversationId: string;
  role: 'founder' | 'operator' | 'builder' | 'observer';
  profileRole: 'operator' | 'admin';
  displayName: string;
}

export function unauthenticated() {
  return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
}

export function denied() {
  return NextResponse.json(
    { error: 'This conversation is not part of your staff inbox' },
    { status: 403 }
  );
}

export function invalid(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function requireStaffContext(
  conversationId: string,
  request?: NextRequest
): Promise<StaffContext | NextResponse> {
  const user = await getAuthenticatedUser(request);

  if (!user) {
    return unauthenticated();
  }

  const trimmedId = conversationId.trim();

  if (!trimmedId) {
    return invalid('conversationId is required');
  }

  const conversation = await getConversation(trimmedId);

  if (!conversation) {
    return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
  }

  const [profileRole, participants] = await Promise.all([
    getProfileRole(user.id),
    getParticipants(trimmedId),
  ]);

  const isStaff = profileRole === 'operator' || profileRole === 'admin';

  if (!isStaff) {
    return denied();
  }

  const isOwner = conversation.user_id === user.id;
  const participant = participants.find((entry) => entry.user_id === user.id);

  const role: StaffContext['role'] = isOwner
    ? 'founder'
    : ((participant?.role as StaffContext['role'] | undefined) ?? 'operator');

  return {
    user,
    conversationId: trimmedId,
    role,
    profileRole: profileRole as 'operator' | 'admin',
    displayName: getActorName(user),
  };
}

// Journey spec: an operator is in a chat because their proposal won it. Admins
// view and join every chat; operators may read the inbox and send proposals
// first, then participate only after their own proposal was accepted (the accept
// auto-invites them, so this mostly covers legacy and manual attempts).
export async function canOperatorParticipate(context: StaffContext): Promise<boolean> {
  if (context.profileRole === 'admin' || context.role === 'founder') {
    return true;
  }

  const participants = await getParticipants(context.conversationId, true);
  if (participants.some((entry) => entry.user_id === context.user.id)) {
    return true;
  }

  return hasAcceptedProposalFrom(context.conversationId, context.user.id);
}

// Adds the staff member to the conversation on first use (so the founder sees them arrive).
export async function ensureStaffParticipant(context: StaffContext): Promise<boolean> {
  if (context.role === 'founder') {
    return true;
  }

  const participants = await getParticipants(context.conversationId);

  if (participants.some((entry) => entry.user_id === context.user.id)) {
    return true;
  }

  const added = await addParticipant({
    conversation_id: context.conversationId,
    user_id: context.user.id,
    role: 'operator',
    display_name: context.displayName,
  });

  if (!added) {
    return false;
  }

  await addMessage({
    conversation_id: context.conversationId,
    sender_type: 'ai',
    sender_name: 'BrandForge',
    content: `${context.displayName} joined this conversation.`,
    content_type: 'system',
  });

  return true;
}

