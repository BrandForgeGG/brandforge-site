export type ProjectStatus =
  | 'DRAFT'
  | 'QUOTE_PENDING'
  | 'AWAITING_PAYMENT'
  | 'PLANNING'
  | 'IN_PROGRESS'
  | 'REVIEW'
  | 'AWAITING_APPROVAL'
  | 'COMPLETED'
  | 'DISPUTED'
  | 'CANCELLED';

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'REVIEW' | 'DONE';

export const projectStatusOrder: ProjectStatus[] = [
  'DRAFT',
  'QUOTE_PENDING',
  'AWAITING_PAYMENT',
  'PLANNING',
  'IN_PROGRESS',
  'REVIEW',
  'AWAITING_APPROVAL',
  'COMPLETED',
];

export type BrandForgeProjectMember = {
  id: string;
  role: 'admin' | 'member' | 'client';
  name: string;
};

export type BrandForgeProject = {
  id: string;
  title: string;
  status: ProjectStatus;
  progress: number;
  budget: string;
  client: string;
  operator: string;
  owner?: string;
  ownerId?: string;
  canManage?: boolean;
  members?: BrandForgeProjectMember[];
  nextMilestone: string;
  description: string;
  timeline: string;
  createdAt?: string;
  updatedAt?: string;
  priority?: 'Low' | 'Medium' | 'High';
  risk?: 'Low' | 'Medium' | 'High';
};

export type BrandForgeTask = {
  id: string;
  projectId?: string;
  title: string;
  status: TaskStatus;
  owner: string;
  due: string;
  canManage?: boolean;
};

export type BrandForgeApproval = {
  id: string;
  projectId: string;
  milestone: string;
  status: 'PENDING' | 'APPROVED' | 'CHANGES_REQUESTED';
  owner: string;
  updatedAt: string;
  comment: string;
};

export const fallbackProjects: BrandForgeProject[] = [
  {
    id: 'proj-1024',
    title: 'BrandForge Launch Site',
    status: 'IN_PROGRESS',
    progress: 68,
    budget: '$8,400',
    client: 'Sample Client',
    operator: 'Nora Patel',
    nextMilestone: 'Design QA + launch checklist',
    description: 'Premium founder-facing website and conversion funnel for the BrandForge product rollout.',
    timeline: '6 weeks',
  },
  {
    id: 'proj-2048',
    title: 'Creator CRM Platform',
    status: 'PLANNING',
    progress: 34,
    budget: '$12,000',
    client: 'Mason Greer',
    operator: 'Drew James',
    nextMilestone: 'Scope lock + specialist brief',
    description: 'AI-assisted creator operations platform with campaign automation and reporting.',
    timeline: '10 weeks',
  },
  {
    id: 'proj-3201',
    title: 'AI Workflow Migration',
    status: 'AWAITING_APPROVAL',
    progress: 92,
    budget: '$15,600',
    client: 'Sienna Voss',
    operator: 'Amal Foster',
    nextMilestone: 'Final delivery review',
    description: 'Migration of internal operations workflows into a documented AI workflow system.',
    timeline: '8 weeks',
  },
];

export const fallbackMilestoneApprovals: BrandForgeApproval[] = [
  {
    id: 'approval-1',
    projectId: 'proj-1024',
    milestone: 'Design QA + launch checklist',
    status: 'PENDING',
    owner: 'Founder',
    updatedAt: 'Today · 2:30 PM',
    comment: 'Awaiting final page QA and final signoff on the GTM copy.',
  },
  {
    id: 'approval-2',
    projectId: 'proj-3201',
    milestone: 'Final delivery review',
    status: 'APPROVED',
    owner: 'Amal Foster',
    updatedAt: 'Yesterday · 11:45 AM',
    comment: 'Delivery passed review and is ready to move into closeout.',
  },
];

export function buildProjectRecord(input: Partial<BrandForgeProject> & { title?: string; client?: string; budget?: string; timeline?: string; description?: string } = {}) {
  const title = String(input.title ?? '').trim();
  const client = String(input.client ?? '').trim();
  const budget = String(input.budget ?? '$4,000').trim() || '$4,000';
  const timeline = String(input.timeline ?? '4 weeks').trim() || '4 weeks';
  const description =
    String(input.description ?? 'New client engagement created from the project intake flow.').trim() ||
    'New client engagement created from the project intake flow.';

  if (!title || !client) {
    return null;
  }

  const now = new Date().toISOString();

  return {
    id: `proj-${Date.now()}`,
    title,
    status: 'DRAFT' as ProjectStatus,
    progress: 12,
    budget,
    client,
    operator: 'BrandForge Team',
    owner: 'founder',
    nextMilestone: 'Scope lock + kickoff',
    description,
    timeline,
    members: [{ id: 'founder', role: 'admin', name: 'Founder' }],
    createdAt: now,
    updatedAt: now,
  } satisfies BrandForgeProject;
}

export function nextProjectStatus(current: ProjectStatus): ProjectStatus {
  const currentIndex = projectStatusOrder.indexOf(current);
  const nextIndex = Math.min(currentIndex + 1, projectStatusOrder.length - 1);
  return projectStatusOrder[nextIndex];
}

export function getProjectWorkflowSummary(projects: BrandForgeProject[]) {
  return {
    total: projects.length,
    inFlight: projects.filter((project) => project.status !== 'COMPLETED').length,
    atReview: projects.filter((project) => project.status === 'REVIEW' || project.status === 'AWAITING_APPROVAL').length,
    completed: projects.filter((project) => project.status === 'COMPLETED').length,
  };
}

export async function getProjects(): Promise<BrandForgeProject[]> {
  try {
    const response = await fetch('/api/projects', { cache: 'no-store' });
    if (!response.ok) {
      return [];
    }

    const payload = await response.json();
    return Array.isArray(payload.projects) ? payload.projects : [];
  } catch {
    return [];
  }
}

export async function getTasks(): Promise<BrandForgeTask[]> {
  try {
    const response = await fetch('/api/tasks', { cache: 'no-store' });
    if (!response.ok) {
      return [];
    }

    const payload = await response.json();
    return Array.isArray(payload.tasks) ? payload.tasks : [];
  } catch {
    return [];
  }
}

export async function createProject(input: {
  title: string;
  client: string;
  budget: string;
  timeline: string;
  description: string;
  nextMilestone?: string;
  initialTasks?: string[];
}) {
  const safe = {
    title: input.title.trim(),
    client: input.client.trim(),
    budget: input.budget.trim() || '$4,000',
    timeline: input.timeline.trim() || '4 weeks',
    description: input.description.trim() || 'New client engagement created from the project intake flow.',
    nextMilestone: input.nextMilestone?.trim() || 'Scope lock + kickoff',
    initialTasks: Array.isArray(input.initialTasks) ? input.initialTasks.filter(Boolean).map((item) => item.trim()).filter(Boolean) : [],
  };

  const built = buildProjectRecord(safe);
  if (!built) {
    return null;
  }

  try {
    const response = await fetch('/api/projects', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(safe),
    });

    if (!response.ok) {
      return built;
    }

    const payload = await response.json();
    return payload.project ?? built;
  } catch {
    return built;
  }
}
