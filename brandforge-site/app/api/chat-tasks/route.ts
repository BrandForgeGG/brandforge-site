import { NextRequest, NextResponse } from 'next/server';
import {
  addMessage,
  assignTask,
  canAccessConversation,
  getConversation,
  getParticipants,
  getTask,
  isStaffAccount,
  nextTaskStatusFor,
  recordFunnelEvent,
  updateTaskDueDate,
  updateTaskStatus,
} from '@/lib/project-db';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { notify } from '@/lib/notify';
import { notifyFounder } from '@/lib/stage-notify';
import { normalizeTaskDueDate } from '@/lib/task-board';
import { checkRateLimit } from '@/lib/rate-limit';

const CHAT_TASKS_RATE_LIMIT = { limit: 60, windowMs: 60 * 60 * 1000 };

export const dynamic = 'force-dynamic';

// Task actions from inside the chat. Staff may move a task forward and claim it; founders may accept
// delivered work (REVIEW -> DONE) once the project is accepted/active/completed. Every transition
// lands in the same chat.

export async function PATCH(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const taskId = String(body.taskId ?? '').trim();
    const action = String(body.action ?? '').trim();
    const assigneeName = String(body.assigneeName ?? '').trim();
    const assigneeId = String(body.assigneeId ?? '').trim();
    const dueDateInput = body.dueDate === undefined ? undefined : body.dueDate === null ? null : String(body.dueDate ?? '').trim();

    if (!taskId) {
      return NextResponse.json({ error: 'taskId is required' }, { status: 400 });
    }

    if (!['schedule', 'assign', 'claim', 'advance', 'reopen'].includes(action)) {
      return NextResponse.json({ error: 'Unknown task action' }, { status: 400 });
    }

    // Throttled after validation so malformed callers keep their 400s instead of
    // burning quota (per-instance window — see lib/rate-limit.js).
    const rate = checkRateLimit(`chat-tasks:${user.id}`, CHAT_TASKS_RATE_LIMIT);
    if (!rate.allowed) {
      return NextResponse.json(
        { error: 'Too many task updates — please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } }
      );
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

    const [conversation, staff] = await Promise.all([
      getConversation(conversationId),
      isStaffAccount(user.id),
    ]);
    const conversationStatus = String(conversation?.status ?? 'DISCOVERY');
    // profiles.role decides staff powers, nothing else. The old participant fallback meant any
    // invited teammate counted as staff and could set due dates, assign work, claim tasks and
    // advance any status (H2).
    const isFounder = conversation?.user_id === user.id;

    let updatedTask = task;

    if (action === 'schedule') {
      // Staff set (or clear) the delivery target. Founders may watch the date move, not set it.
      if (!staff) {
        return NextResponse.json({ error: 'Only BrandForge staff can set due dates' }, { status: 403 });
      }

      const normalized = normalizeTaskDueDate(dueDateInput);

      if (!normalized.ok) {
        return NextResponse.json({ error: 'dueDate must be YYYY-MM-DD' }, { status: 400 });
      }

      const scheduled = await updateTaskDueDate(taskId, normalized.iso ?? null);

      if (!scheduled) {
        return NextResponse.json({ error: 'Task due date could not be updated' }, { status: 500 });
      }

      updatedTask = scheduled;
    } else if (action === 'assign') {
      if (!staff) {
        return NextResponse.json({ error: 'Only BrandForge staff can assign tasks' }, { status: 403 });
      }

      const participants = await getParticipants(conversationId);
      const assignee = participants.find((participant) => participant.user_id === assigneeId);

      if (!assignee) {
        return NextResponse.json(
          { error: 'Assignee must be one of this chat\u2019s participants' },
          { status: 400 }
        );
      }

      const assigned = await assignTask(taskId, {
        assignee_id: assignee.user_id,
        assignee_name:
          String(assignee.display_name ?? '').trim() ||
          assigneeName ||
          'BrandForge staff',
      });

      if (!assigned) {
        return NextResponse.json({ error: 'Task could not be assigned' }, { status: 500 });
      }

      updatedTask = assigned;
    } else if (action === 'claim') {
      if (!staff) {
        return NextResponse.json({ error: 'Only BrandForge staff can claim tasks' }, { status: 403 });
      }

      const claimed = await assignTask(taskId, {
        assignee_id: user.id,
        assignee_name:
          assigneeName ||
          String(user.user_metadata?.full_name ?? '').trim() ||
          String(user.email ?? '').split('@')[0] ||
          'BrandForge staff',
      });

      if (!claimed) {
        return NextResponse.json({ error: 'Task could not be claimed' }, { status: 500 });
      }

      updatedTask = claimed;
    } else {
      const currentStatus = String(task.status ?? 'TODO');
      // Forward movement for whoever may advance (staff walk the line, founders close
      // REVIEW once delivered); send-back returns delivered work to progress, staff only.
      const target =
        action === 'advance'
          ? nextTaskStatusFor(currentStatus, staff, conversationStatus)
          : action === 'reopen' && staff && currentStatus === 'REVIEW'
            ? 'IN_PROGRESS'
            : null;

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

    const line =
      action === 'schedule'
        ? `${updatedTask.status} · ${updatedTask.title} · due ${updatedTask.due_date ? new Date(updatedTask.due_date).toISOString().slice(0, 10) : 'no date'}`
        : action === 'assign'
          ? `${updatedTask.status} · ${updatedTask.title} (${updatedTask.assignee_name ?? 'BrandForge staff'})`
          : `${updatedTask.status} · ${updatedTask.title}${
              updatedTask.assignee_name ? ` (${updatedTask.assignee_name})` : ''
            }`;

    const systemMessage = await addMessage({
      conversation_id: conversationId,
      sender_type: isFounder ? 'user' : 'human_operator',
      sender_id: user.id,
      sender_name: isFounder ? 'BrandForge' : 'BrandForge team',
      content: line,
      content_type: 'system',
    });

    if (!systemMessage) {
      console.error('Failed to add system message for task update:', taskId);
    }

    // Delivered work is the one transition the founder must not miss — they hold the approval.
    if (updatedTask.status === 'REVIEW') {
      await notify('task_review', {
        title: updatedTask.title,
        assigneeName: updatedTask.assignee_name,
        conversationId,
      });
      await notifyFounder(conversationId, 'milestone_ready', {
        title: updatedTask.title,
        assigneeName: updatedTask.assignee_name,
      });
    }

    // A task reaching DONE is a founder approving delivered work, which is the unit the escrow
    // schedule is paid against. Recorded server-side at the moment the transition succeeds.
    if (updatedTask.status === 'DONE') {
      await recordFunnelEvent('milestone_completed', {
        signedIn: true,
        properties: { stage: 'deliver', status: 'DONE' },
      });
    }

    return NextResponse.json({ success: true, task: updatedTask });
  } catch (error) {
    console.error('Task action API error:', error);
    return NextResponse.json(
      { error: 'Failed to update task' },
      { status: 500 }
    );
  }
}
