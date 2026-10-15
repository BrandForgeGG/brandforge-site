'use client';

import { useEffect, useState } from 'react';
import { fetchAuthed } from '@/lib/browser-auth';

type Usage = { registered: number; online: number; totalHours: number; averageMinutesPerMember: number; since: string | null; yourMinutes: number | null };

function duration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

function Stat({ value, label, live }: { value: string; label: string; live?: boolean }) {
  return (
    <div className="rounded-2xl border border-line bg-panel p-4">
      <p className="flex items-center gap-2 font-serif text-2xl text-foreground sm:text-3xl">
        {live ? <span className="h-2 w-2 animate-pulse rounded-full bg-success motion-reduce:animate-none" aria-hidden="true" /> : null}
        <span className="tabular-nums">{value}</span>
      </p>
      <p className="mt-1 text-xs text-muted">{label}</p>
    </div>
  );
}

// The live numbers on Explore: members, who is here now, and the time people spend on BrandForge. Time is counted from a
// once-a-minute heartbeat of visitors who accepted measurement, so it is a floor, not an estimate.
export function UsageStats() {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      const res = await fetchAuthed('/api/usage').catch(() => null);
      if (!alive) return;
      if (!res || !res.ok) {
        setFailed(true);
        return;
      }
      setUsage((await res.json()) as Usage);
    };
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 300_000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, []);

  if (failed && !usage) return null;

  return (
    <section aria-label="BrandForge in numbers">
      {usage === null ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" aria-hidden="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bf-skeleton h-24 rounded-2xl bg-overlay" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat value={usage.registered.toLocaleString()} label="Members" />
            <Stat value={usage.online.toLocaleString()} label="Online now" live />
            <Stat value={usage.totalHours.toLocaleString()} label="Hours spent on BrandForge" />
            <Stat value={duration(usage.averageMinutesPerMember)} label="Average time per member" />
          </div>
          <p className="mt-2 text-xs text-muted">
            {usage.yourMinutes !== null ? <>You have spent {duration(usage.yourMinutes)} here. </> : null}
            Time counts open, visible tabs of visitors who accepted measurement{usage.since ? `, since ${new Date(`${usage.since}T00:00:00Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}.
          </p>
        </>
      )}
    </section>
  );
}
