import { NextRequest, NextResponse } from 'next/server';
import {
  CHAT_TASK_STATUSES,
  addMessage,
  assignTask,
  canAccessConversation,
  getConversation,
  getParticipants,
  getTask,
  isStaffAccount,
  nextTaskStatusFor,
  updateTaskStatus,
} from '@/lib/project-db';
import { getAuthenticatedUser } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

// Task actions from inside the chat. Staff may move a task forward and claim it; founders may accept
// delivered work (REVIEW -> DONE) once the project is accepted/active/completed. Every transition
// lands in the same chat.
async function isStaff(userId: string, conversationId: string): Promise<boolean> {
  // profiles.role decides who is staff, not the participant row: the team can act on a chat it has
  // not joined yet. The participant lookup stays as a fallback for builders invited by hand.
  if (await isStaffAccount(userId)) {
    return true;
  }

  const participants = await getParticipants(conversationId);
  return participants.some((participant) => participant.user_id === userId);
}

export async function PATCH(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const taskId = String(body.taskId ?? '').trim();
    const status = String(body.status ?? '').trim();
    const action = String(body.action ?? '').trim();
    const assigneeName = String(body.assigneeName ?? '').trim();

    if (!taskId) {
      return NextResponse.json({ error: 'taskId is required' }, { status: 400 });
    }

    const task = await getTask(taskId);

    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    const conversationId = String(task.conversation_id);
    const hasAccess = await canAccessConversation(user.id, conversationId, { allowStaff: true });

    if (!hasAccess) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const conversation = await getConversation(conversationId);
    const conversationStatus = String(conversation?.status ?? 'DISCOVERY');
    const staff = await isStaff(user.id, conversationId);
    const isFounder = conversation?.user_id === user.id;

    let updatedTask = task;

    if (action === 'claim') {
      if (!staff) {
        return NextResponse.json({ error: 'Only BrandForge staff can claim tasks' }, { status: 403 });
      }

      const claimed = await assignTask(taskId, {
        assignee_id: user.id,
        assignee_name:
          assigneeName ||
          String(user.user_metadata?.full_name ?? user.email ?? 'BrandForge staff'),
      });

      if (!claimed) {
        return NextResponse.json({ error: 'Task could not be claimed' }, { status: 500 });
      }

      updatedTask = claimed;
    } else {
      const currentStatus = String(task.status ?? 'TODO');
      const requested =
        action === 'advance' ? nextTaskStatusFor(currentStatus, staff, conversationStatus) : null;
      const explicit = CHAT_TASK_STATUSES.includes(status as never)
        ? (status as (typeof CHAT_TASK_STATUSES)[number])
        : null;

      // An explicit status is honoured only when it equals the step this role may take.
      const target = requested ?? explicit;

      if (!target || target === currentStatus) {
        return NextResponse.json(
          { error: 'This task status transition is not allowed for your role' },
          { status: 409 }
        );
      }

      const moved = await updateTaskStatus(taskId, target);

      if (!moved) {
        return NextResponse.json({ error: 'Task could not be updated' }, { status: 500 });
      }

      updatedTask = moved;
    }

    const line = `${updatedTask.status} · ${updatedTask.title}${
      updatedTask.assignee_name ? ` (${updatedTask.assignee_name})` : ''
    }`;

    await addMessage({
      conversation_id: conversationId,
      sender_type: isFounder ? 'user' : 'human_operator',
      sender_id: user.id,
      sender_name: isFounder ? 'BrandForge' : 'BrandForge team',
      content: line,
      content_type: 'system',
    });

    return NextResponse.json({ success: true, task: updatedTask });
  } catch (error) {
    console.error('Task action API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update task' },
      { status: 500 }
    );
  }
}
