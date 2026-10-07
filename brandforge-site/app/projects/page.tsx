'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
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
    <div className="bf-page">
      <main className="mx-auto max-w-3xl px-6 py-16">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-serif text-3xl text-foreground">Projects</h1>
            <p className="mt-2 text-muted">Everything BrandForge knows about your objectives.</p>
          </div>
          <button
            type="button"
            onClick={() => router.push('/chat')}
            className="bf-button bf-button-primary"
          >
            New Chat
          </button>
        </div>

        {isLoading ? (
          <p className="mt-8 text-sm text-muted">Loading projects…</p>
        ) : projects.length === 0 ? (
          <div className="mt-8 bf-card p-8 text-center">
            <p className="text-sm font-semibold text-foreground">Your projects live here</p>
            <p className="mt-1 text-sm text-muted">Start with one of these. It opens in a chat you can share.</p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {[
                ['Plan my idea', '/create'],
                ['Audit a URL', '/create'],
                ['Write ads', '/distribute'],
                ['Launch plan', '/distribute'],
              ].map(([label, href]) => (
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
            <button
              type="button"
              onClick={() => router.push('/chat')}
              className="mt-5 bf-button bf-button-primary"
            >
              Start a chat
            </button>
          </div>
        ) : (
          <div className="mt-8 space-y-2">
            {projects.map((project) => (
              <button
                key={project.id}
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
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
