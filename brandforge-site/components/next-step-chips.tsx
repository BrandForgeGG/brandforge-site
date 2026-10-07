'use client';

type Step = { label: string; text?: string; action?: 'invite' };

const STEPS: Step[] = [
  { label: 'Turn this into ads', text: 'Turn this into ready-to-run ads for Meta, Google and TikTok.' },
  { label: '30-day calendar', text: 'Build a 30-day content calendar from this, as a table I can export.' },
  { label: 'Audit a URL', text: 'Audit this site and tell me what to fix first: https://' },
  { label: 'Invite my team', action: 'invite' },
];

// Shown under an AI answer so there is always an obvious next move. Chips fill the
// composer (the person stays in control of sending); "Invite my team" opens the invite menu.
export function NextStepChips({
  visible,
  onPick,
  onInvite,
  canInvite,
}: {
  visible: boolean;
  onPick: (text: string) => void;
  onInvite: () => void;
  canInvite: boolean;
}) {
  if (!visible) return null;
  return (
    <div className="px-4 sm:px-6">
      <div
        className="mx-auto mb-2 flex max-w-3xl flex-wrap items-center gap-2"
        role="group"
        aria-label="Suggested next steps"
      >
        <span className="text-[11px] uppercase tracking-[0.15em] text-muted">Next</span>
        {STEPS.filter((step) => step.action !== 'invite' || canInvite).map((step) => (
          <button
            key={step.label}
            type="button"
            onClick={() => (step.action === 'invite' ? onInvite() : onPick(step.text ?? ''))}
            className="inline-flex min-h-8 items-center rounded-full border border-line px-3 py-1 text-xs text-muted transition hover:border-ember hover:text-foreground"
          >
            {step.label}
          </button>
        ))}
      </div>
    </div>
  );
}
