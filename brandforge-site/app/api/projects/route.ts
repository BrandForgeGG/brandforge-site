import { NextRequest, NextResponse } from 'next/server';
import type { User } from '@supabase/supabase-js';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getAuthenticatedUser } from '@/lib/supabase-server';
import { getAccessibleProjectIds, getActorDisplayName } from '@/lib/supabase/workflow-access';
import { deleteProjectForUser } from '@/lib/project-db';
import { buildProjectRecord, projectStatusOrder, type BrandForgeProject } from '@/lib/brandforge-data';

export const dynamic = 'force-dynamic';

function normalizeProjectStatus(value: string | null | undefined): BrandForgeProject['status'] {
  const normalized = (value ?? 'DRAFT').toUpperCase();

  switch (normalized) {
    case 'QUOTE_PENDING':
      return 'QUOTE_PENDING';
    case 'AWAITING_PAYMENT':
      return 'AWAITING_PAYMENT';
    case 'PLANNING':
      return 'PLANNING';
    case 'IN_PROGRESS':
      return 'IN_PROGRESS';
    case 'REVIEW':
      return 'REVIEW';
    case 'AWAITING_APPROVAL':
      return 'AWAITING_APPROVAL';
    case 'COMPLETED':
      return 'COMPLETED';
    case 'DISPUTED':
      return 'DISPUTED';
    case 'CANCELLED':
      return 'CANCELLED';
    default:
      return 'DRAFT';
  }
}

interface ProjectRow {
  id: string;
  owner_id?: string | null;
  title?: string | null;
  client?: string | null;
  description?: string | null;
  status?: string | null;
  budget?: string | null;
  timeline?: string | null;
  progress?: number | null;
  next_milestone?: string | null;
}

function mapProjectRow(project: ProjectRow, user: User | null | undefined): BrandForgeProject {
  const canManage = project.owner_id === user?.id;

  return {
    id: project.id,
    title: project.title ?? 'Untitled project',
    status: normalizeProjectStatus(project.status),
    progress: Number(project.progress ?? 0),
    budget: project.budget ?? '$4,000',
    client: project.client ?? 'New client',
    operator: canManage ? getActorDisplayName(user) : 'Project owner',
    owner: canManage ? 'owner' : undefined,
    ownerId: project.owner_id ?? undefined,
    canManage,
    nextMilestone: project.next_milestone ?? 'Execution checkpoint and milestone update',
    description: project.description ?? 'Project created from the workflow intake flow.',
    timeline: project.timeline ?? '4 weeks',
  };
}

async function ensureFounderProfile(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  user: User
) {
  const fullName =
    String(user.user_metadata?.full_name ?? user.user_metadata?.name ?? '').trim() ||
    (user.email ? user.email.split('@')[0] : 'BrandForge Founder');

  // Never write profiles.role here — column grants revoke it from authenticated
  // (roles come from signup seed / admin accept only).
  const { data, error } = await supabase
    .from('profiles')
    .upsert(
      {
        id: user.id,
        full_name: fullName,
        company_name: user.user_metadata?.company_name ?? 'BrandForge Studio',
      },
      { onConflict: 'id' }
    )
    .select('id, full_name, role, company_name')
    .single();

  if (error) {
    console.error('Profile upsert failed:', error.message);
  }

  return data ?? null;
}

async function loadProjectsFromSupabase(request: NextRequest): Promise<BrandForgeProject[] | null> {
  const supabase = await createSupabaseServerClient(request);
  const userData = await getAuthenticatedUser(request);

  if (!userData) {
    return null;
  }

  const accessibleProjectIds = await getAccessibleProjectIds(supabase, userData.id);

  if (accessibleProjectIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from('projects')
    .select('id, owner_id, title, description, status, budget, timeline, progress, next_milestone')
    .in('id', accessibleProjectIds)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Project lookup failed:', error.message);
    return [];
  }

  return (data ?? []).map((project: ProjectRow) => mapProjectRow(project, userData));
}

export async function GET(request: NextRequest) {
  const userData = await getAuthenticatedUser(request);

  if (!userData) {
    return NextResponse.json({ projects: [], error: 'Authentication required.' }, { status: 401 });
  }

  const liveProjects = await loadProjectsFromSupabase(request);

  return NextResponse.json({
    projects: Array.isArray(liveProjects) ? liveProjects : [],
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const title = String(body.title ?? 'Untitled project').trim();
  const client = String(body.client ?? 'New client').trim();
  const initialTasks = Array.isArray(body.initialTasks)
    ? body.initialTasks.map((item: unknown) => String(item ?? '').trim()).filter(Boolean)
    : [];

  const project = buildProjectRecord({
    title,
    client,
    budget: String(body.budget ?? '$4,000').trim() || '$4,000',
    description:
      String(body.description ?? 'New client engagement created from the project intake flow.').trim() ||
      'New client engagement created from the project intake flow.',
    timeline: String(body.timeline ?? '4 weeks').trim() || '4 weeks',
    nextMilestone: String(body.nextMilestone ?? 'Scope lock + kickoff').trim() || 'Scope lock + kickoff',
  });

  if (!project || !project.title || !project.client) {
    return NextResponse.json({ error: 'Title and client are required.' }, { status: 400 });
  }

  try {
    const supabase = await createSupabaseServerClient(request);
    const userData = await getAuthenticatedUser(request);

    if (!userData) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    await ensureFounderProfile(supabase, userData);

    const { data: inserted, error } = await supabase
      .from('projects')
      .insert({
        owner_id: userData.id,
        title: project.title,
        description: project.description,
        status: project.status,
        budget: project.budget,
        timeline: project.timeline,
        progress: project.progress,
        next_milestone: body.nextMilestone ?? project.nextMilestone,
      })
      .select('id, owner_id, title, description, status, budget, timeline, progress, next_milestone')
      .single();

    if (error || !inserted) {
      return NextResponse.json({ error: 'Project could not be created in Supabase.' }, { status: 500 });
    }

    const { error: membershipError } = await supabase
      .from('project_members')
      .upsert(
        {
          project_id: inserted.id,
          user_id: userData.id,
          role: 'admin',
        },
        { onConflict: 'project_id,user_id' }
      );

    if (membershipError) {
      return NextResponse.json({ error: 'Project owner membership could not be created.' }, { status: 500 });
    }

    const generatedTasks = initialTasks.length > 0 ? initialTasks : [
      'Scope lock and kickoff brief',
      'Design direction and landing page wireframe',
      'Build dashboard and workflow skeleton',
      'Integrate payments and delivery flow',
      'QA, signoff, and launch readiness',
    ];

    const { data: taskRows, error: taskError } = await supabase
      .from('tasks')
      .insert(
        generatedTasks.map((taskTitle: string, index: number) => ({
          project_id: inserted.id,
          title: taskTitle,
          owner_id: userData.id,
          status: index === 0 ? 'IN_PROGRESS' : 'TODO',
          due_date: new Date(Date.now() + (index + 1) * 86400000).toISOString().slice(0, 10),
        }))
      )
      .select('id, title, status, owner_id, due_date');

    if (taskError) {
      console.error('Initial task creation failed:', taskError.message);
    }

    const { error: approvalError } = await supabase.from('project_approvals').upsert(
      {
        project_id: inserted.id,
        milestone: String(body.nextMilestone ?? project.nextMilestone).trim() || 'Scope lock + kickoff',
        status: 'PENDING',
        owner: userData.email ?? 'BrandForge Team',
        comment: 'Project created from the intake flow and awaiting kickoff confirmation.',
      },
      { onConflict: 'project_id,milestone' }
    );

    if (approvalError) {
      console.error('Approval creation failed:', approvalError.message);
    }

    return NextResponse.json({
      project: mapProjectRow(inserted, userData),
      tasks: taskRows ?? [],
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to create project.',
    }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const body = await request.json();
  const projectId = String(body.projectId ?? '').trim();

  if (!projectId) {
    return NextResponse.json({ error: 'projectId is required.' }, { status: 400 });
  }

try {
    const userData = await getAuthenticatedUser(request);

    if (!userData) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    const supabase = await createSupabaseServerClient(request);

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, owner_id, status, progress, next_milestone')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
    }

    const accessibleProjectIds = await getAccessibleProjectIds(supabase, userData.id);
    if (!accessibleProjectIds.includes(projectId)) {
      return NextResponse.json({ error: 'Project access denied.' }, { status: 403 });
    }

    if (project.owner_id !== userData.id) {
      return NextResponse.json({ error: 'Only the project owner can advance its stage.' }, { status: 403 });
    }

    const currentStatus = normalizeProjectStatus(project.status);
    const currentIndex = projectStatusOrder.indexOf(currentStatus);
    const nextIndex = currentIndex >= 0
      ? Math.min(currentIndex + 1, projectStatusOrder.length - 1)
      : 0;
    const nextStatus = projectStatusOrder[nextIndex];
    const nextProgress = nextStatus === 'COMPLETED'
      ? 100
      : Math.min(Math.max(Number(project.progress ?? 0) + 12, 12), 100);
    const nextMilestone = nextStatus === 'COMPLETED'
      ? 'Delivery approved and closed'
      : nextStatus === 'REVIEW'
        ? 'Stakeholder review and signoff'
        : nextStatus === 'AWAITING_APPROVAL'
          ? 'Final delivery review'
          : 'Execution checkpoint and milestone update';

    const { data: updated, error: updateError } = await supabase
      .from('projects')
      .update({
        status: nextStatus,
        progress: nextProgress,
        next_milestone: nextMilestone,
        updated_at: new Date().toISOString(),
      })
      .eq('id', projectId)
      .select('id, owner_id, title, description, status, budget, timeline, progress, next_milestone')
      .single();

    if (updateError || !updated) {
      return NextResponse.json({ error: 'Project could not be advanced.' }, { status: 500 });
    }

    return NextResponse.json({ project: mapProjectRow(updated, userData) });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to advance project.',
    }, { status: 500 });
  }
}

// Owners can delete a project - and with it the members, approvals and tasks that belong to it.
export async function DELETE(request: NextRequest) {
  try {
    const userData = await getAuthenticatedUser(request);

    if (!userData) {
      return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
    }

    let body: { projectId?: string } = {};

    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const projectId = String(
      body.projectId ?? request.nextUrl.searchParams.get('projectId') ?? ''
    ).trim();

    if (!projectId) {
      return NextResponse.json({ error: 'projectId is required.' }, { status: 400 });
    }

    const outcome = await deleteProjectForUser(userData.id, projectId);

    if (outcome === 'deleted') {
      return NextResponse.json({ deleted: true, projectId });
    }

    const status =
      outcome === 'not_found'
        ? 404
        : outcome === 'forbidden'
          ? 403
          : outcome === 'not_configured'
            ? 503
            : 500;

    const message =
      outcome === 'not_found'
        ? 'Project not found.'
        : outcome === 'forbidden'
          ? 'Only the project owner can delete it.'
          : outcome === 'not_configured'
            ? 'Deleting projects needs the server-only Supabase service role key (SUPABASE_SERVICE_ROLE_KEY).'
            : 'The project could not be deleted.';

    return NextResponse.json({ error: message, outcome }, { status });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to delete project.',
    }, { status: 500 });
  }
}
