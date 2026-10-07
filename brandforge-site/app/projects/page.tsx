'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { fetchAuthed } from '@/lib/browser-auth';
import { relativeTime } from '@/components/conversation-rail';

interface Project {
  id: string;
  title: string;
  status: string;
  messageCount: number;
  lastActivity: string | null;
  preview: string | null;
}

const STATUS_LABELS: Record<string, string> = {
  DISCOVERY: 'Discovery',
  READY_FOR_REVIEW: 'With BrandForge',
  REVIEW: 'Review',
  PROPOSED: 'Proposed',
  ACCEPTED: 'Accepted',
  ACTIVE: 'In delivery',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

const STARTERS: [string, string][] = [
  ['Plan my idea', '/create'],
  ['Audit a URL', '/create'],
  ['Write ads', '/distribute'],
  ['Launch plan', '/distribute'],
];

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadProjects() {
      try {
        const response = await fetchAuthed('/api/conversations-list');
        if (response.ok) {
          const data = await response.json();
          setProjects(Array.isArray(data.conversations) ? data.conversations : []);
        }
      } catch {
        setProjects([]);
      } finally {
        setIsLoading(false);
      }
    }
    void loadProjects();
  }, []);

  return (
    <AppShell
      title="Projects"
      actions={
        <button type="button" onClick={() => router.push('/chat')} className="bf-button bf-button-primary">
          New chat
        </button>
      }
    >
      {isLoading ? (
        <div className="space-y-2" aria-busy="true" aria-label="Loading projects">
          {[0, 1, 2].map((row) => (
            <div key={row} className="bf-card h-16 animate-pulse" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="bf-card p-8 text-center">
          <p className="text-sm font-semibold text-foreground">Your projects live here</p>
          <p className="mt-1 text-sm text-muted">Start with one of these. It opens in a chat you can share.</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {STARTERS.map(([label, href]) => (
              <button
                key={label}
                type="button"
                onClick={() => router.push(href)}
                className="rounded-full border border-line px-3 py-1.5 text-xs text-muted transition hover:border-ember hover:text-foreground"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <ul className="space-y-2">
          {projects.map((project) => (
            <li key={project.id}>
              <button
                type="button"
                onClick={() => router.push(`/chat?conversationId=${project.id}`)}
                className="bf-card w-full p-4 text-left transition hover:border-ember/40"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-foreground">{project.title}</p>
                    {project.preview ? (
                      <p className="mt-0.5 truncate text-xs text-muted">{project.preview}</p>
                    ) : null}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs text-muted">{STATUS_LABELS[project.status] ?? project.status}</p>
                    <p className="mt-0.5 text-[10px] text-muted">
                      {project.lastActivity ? relativeTime(project.lastActivity) : 'no activity'}
                    </p>
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </AppShell>
  );
}
