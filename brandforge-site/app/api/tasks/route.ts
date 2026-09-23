import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { type BrandForgeTask } from '@/lib/brandforge-data';

export const dynamic = 'force-dynamic';

function normalizeTaskStatus(value: string | null | undefined): BrandForgeTask['status'] {
  const normalized = (value ?? 'TODO').toUpperCase();

  if (normalized === 'IN_PROGRESS') return 'IN_PROGRESS';
  if (normalized === 'REVIEW') return 'REVIEW';
  if (normalized === 'DONE') return 'DONE';
  return 'TODO';
}

function normalizeDueDate(value: string | null | undefined): string | null {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;

  const parsed = new Date(`${trimmed}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function formatDueLabel(dueDate: string | null | undefined): string {
  if (!dueDate) return 'TBD';

  const parsed = new Date(`${dueDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return dueDate;
  }

  return parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

type TaskRow = {
  id: string;
  project_id?: string | null;
  title?: string | null;
  status?: string | null;
  owner_id?: string | null;
  due_date?: string | null;
};

function mapTaskRow(task: TaskRow, profileMap: Map<string, string>): BrandForgeTask {
  return {
    id: task.id,
    projectId: task.project_id ?? undefined,
    title: task.title ?? 'Untitled task',
    status: normalizeTaskStatus(task.status),
    owner: profileMap.get(task.owner_id ?? '') ?? 'BrandForge Team',
    due: formatDueLabel(task.due_date),
  };
}

async function getAccessibleProjectIds(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, userId: string) {
  const [ownedResult, membershipResult] = await Promise.all([
    supabase.from('projects').select('id').eq('owner_id', userId),
    supabase.from('project_members').select('project_id').eq('user_id', userId),
  ]);

  const directIds = (ownedResult.data ?? []).map((row: { id: string }) => row.id);
  const memberIds = (membershipResult.data ?? []).map((row: { project_id: string }) => row.project_id);
  return Array.from(new Set([...directIds, ...memberIds]));
}

async function loadTasksFromSupabase(request: NextRequest): Promise<BrandForgeTask[] | null> {
  const supabase = await createSupabaseServerClient(request);
  const user = await getAuthenticatedUser(request);

  if (!user) {
    return null;
  }

  const accessibleProjectIds = await getAccessibleProjectIds(supabase, user.id);
  if (accessibleProjectIds.length === 0) {
    return [];
  }

  const { data: profilesData } = await supabase.from('profiles').select('id, full_name');
  const profileMap = new Map<string, string>();
  (profilesData ?? []).forEach((profile: { id: string; full_name: string | null }) => {
    profileMap.set(profile.id, profile.full_name || 'BrandForge Team');
  });

  const { data: tasksData, error } = await supabase
    .from('tasks')
    .select('id, project_id, title, status, owner_id, due_date')
    .in('project_id', accessibleProjectIds)
    .order('created_at', { ascending: false });

  if (error || !tasksData || tasksData.length === 0) {
    return [];
  }

  return tasksData.map((task: TaskRow) => mapTaskRow(task, profileMap));
}

export async function GET(request: NextRequest) {
  const user = await getAuthenticatedUser(request);

  if (!user) {
    return NextResponse.json({ tasks: [], error: 'Authentication required.' }, { status: 401 });
  }

  const liveTasks = await loadTasksFromSupabase(request);
  return NextResponse.json({
    tasks: Array.isArray(liveTasks) ? liveTasks : [],
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const projectId = String(body.projectId ?? '').trim();
  const title = String(body.title ?? '').trim();
  const owner = String(body.owner ?? 'BrandForge Team').trim() || 'BrandForge Team';
  const status = normalizeTaskStatus(body.status);
  const dueDate = String(body.dueDate ?? '').trim();

  if (!projectId || !title) {
    return NextResponse.json({ error: 'projectId and title are required.' }, { status: 400 });
  }

  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const supabase = await createSupabaseServerClient(request);
    const accessibleProjectIds = await getAccessibleProjectIds(supabase, user.id);
    if (!accessibleProjectIds.includes(projectId)) {
      return NextResponse.json({ error: 'Project access denied.' }, { status: 403 });
    }

    const { data, error } = await supabase
      .from('tasks')
      .insert({
        project_id: projectId,
        title,
        owner_id: user.id,
        status,
        due_date: normalizeDueDate(dueDate),
      })
      .select('id, project_id, title, status, owner_id, due_date')
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'Task could not be created.' }, { status: 500 });
    }

    const profileMap = new Map<string, string>([[user.id, owner || user.email || 'BrandForge Team']]);
    return NextResponse.json({ task: mapTaskRow(data, profileMap) });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to create task.',
    }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const taskId = String(body.taskId ?? '').trim();

  if (!taskId) {
    return NextResponse.json({ error: 'taskId is required.' }, { status: 400 });
  }

  try {
    const user = await getAuthenticatedUser(request);

    if (!user) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const supabase = await createSupabaseServerClient(request);
    const { data: task, error: taskError } = await supabase
      .from('tasks')
      .select('id, project_id, status')
      .eq('id', taskId)
      .single();

    if (taskError || !task) {
      return NextResponse.json({ error: 'Task not found.' }, { status: 404 });
    }

    const { data: project } = await supabase
      .from('projects')
      .select('id, owner_id')
      .eq('id', task.project_id)
      .single();

    if (!project) {
      return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
    }

    const accessibleProjectIds = await getAccessibleProjectIds(supabase, user.id);
    if (!accessibleProjectIds.includes(task.project_id)) {
      return NextResponse.json({ error: 'Project access denied.' }, { status: 403 });
    }

    if (project.owner_id !== user.id) {
      return NextResponse.json({ error: 'Only the project owner can update tasks.' }, { status: 403 });
    }

    const normalized = normalizeTaskStatus(task.status);
    const statusOrder: BrandForgeTask['status'][] = ['TODO', 'IN_PROGRESS', 'REVIEW', 'DONE'];
    const currentIndex = statusOrder.indexOf(normalized);
    const nextStatus = statusOrder[Math.min(currentIndex + 1, statusOrder.length - 1)];

    const { data: profilesData } = await supabase.from('profiles').select('id, full_name');
    const profileMap = new Map<string, string>();
    (profilesData ?? []).forEach((profile: { id: string; full_name: string | null }) => {
      profileMap.set(profile.id, profile.full_name || 'BrandForge Team');
    });

    const { data: updated, error: updateError } = await supabase
      .from('tasks')
      .update({
        status: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq('id', taskId)
      .select('id, project_id, title, status, owner_id, due_date')
      .single();

    if (updateError || !updated) {
      return NextResponse.json({ error: 'Task could not be updated.' }, { status: 500 });
    }

    return NextResponse.json({ task: mapTaskRow(updated, profileMap) });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to update task.',
    }, { status: 500 });
  }
}
