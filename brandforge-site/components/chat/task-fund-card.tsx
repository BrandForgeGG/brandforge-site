'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchAuthed } from '@/lib/browser-auth';
import { CryptoCheckout, readCryptoAssets } from '@/components/crypto-checkout';
import { TaskCardView, type TaskAction, type TaskStatus, type TaskView } from '@/components/work/task-card-view';

type Live = TaskView & { role: 'buyer' | 'team' };

// A task in its chat, live: the shared card (components/work/task-card-view) plus the moves behind its buttons. Each side
// answers in its own browser, so the card looks again every 15 seconds until the work is delivered.
export function TaskFundCard({ agreementId, status, title, amount }: { agreementId: string; status: string; title?: string; amount?: number; canPay: boolean }) {
  const [live, setLive] = useState<Live | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [crypto, setCrypto] = useState(false);
  const [cryptoOn, setCryptoOn] = useState(false);

  const load = useCallback(async () => {
    const res = await fetchAuthed(`/api/tasks/${agreementId}`).catch(() => null);
    if (res?.ok) setLive((await res.json()) as Live);
  }, [agreementId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on mount
    void load();
    void readCryptoAssets().then((list) => setCryptoOn(list.length > 0)).catch(() => undefined);
  }, [load]);

  useEffect(() => {
    if (live?.status === 'delivered') return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [live?.status, load]);

  async function onAction(action: TaskAction, extra: Record<string, unknown> = {}) {
    if (action === 'pay_crypto') {
      setCrypto(true);
      return;
    }
    setBusy(action);
    setError('');
    if (action === 'pay') {
      const res = await fetchAuthed('/api/billing/task-checkout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agreementId }) }).catch(() => null);
      const data = res ? ((await res.json().catch(() => ({}))) as { url?: string; error?: string }) : {};
      if (res?.ok && data.url) {
        window.location.assign(data.url);
        return;
      }
      setBusy(null);
      setError(data.error || 'Payment could not start. Try again.');
      return;
    }
    const res = await fetchAuthed(`/api/tasks/${agreementId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...extra }) }).catch(() => null);
    const data = res ? ((await res.json().catch(() => ({}))) as Live & { error?: string }) : null;
    setBusy(null);
    if (!res?.ok || !data) {
      setError(data?.error || 'Could not save. Try again.');
      return;
    }
    setLive(data);
  }

  const known: TaskStatus[] = ['open', 'countered', 'accepted', 'funded', 'review', 'delivered'];
  const fallback: Live = { role: 'buyer', status: (known.includes(status as TaskStatus) ? status : 'open') as TaskStatus, amount: amount ?? 0 };
  const view = live ?? fallback;
  return (
    <div className="mx-auto my-4 w-full max-w-md">
      <TaskCardView title={title || 'Task'} task={view} role={view.role} busy={busy} error={error} cryptoOn={cryptoOn} onAction={(action, extra) => void onAction(action, extra)} />
      {crypto ? <CryptoCheckout purpose="agreement" refId={agreementId} title={title || 'Task'} onClose={() => setCrypto(false)} /> : null}
    </div>
  );
}
