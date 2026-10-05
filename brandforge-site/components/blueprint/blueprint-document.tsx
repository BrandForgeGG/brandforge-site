import type { ReactNode } from 'react';
import type { BlueprintDocument } from '@/lib/blueprint-schema';

// Read-only renderer for a validated blueprint document (brief 4.10, screens
// 3-4). Everything shown here passed the validator, so the structure below can
// rely on word caps and shapes — but every accessor still tolerates missing
// fields, because an old stored version must never white-screen the page.
//
// Presentation rules from the brief: the estimate always carries its
// "AI draft, not final" label, the mirror leads, ethics is stated plainly,
// and nothing here implies a guarantee.

type Row = Record<string, unknown>;

const LANE_PRESENTATION: Record<string, { label: string; tone: string }> = {
  deliver_now: { label: 'Ready to build', tone: 'border-ember/40 text-ember' },
  scope_first: { label: 'Needs a discovery step', tone: 'border-ember/40 text-ember' },
  reframe: { label: 'Reframed', tone: 'border-copper/40 text-copper' },
  decline: { label: 'Out of our scope', tone: 'border-line text-muted' },
  needs_review: { label: 'Needs a human look', tone: 'border-copper/40 text-copper' },
};

const FINDING_LABELS: Record<string, string> = {
  strength: 'Strength',
  gap: 'Gap',
  risk: 'Risk',
  insight: 'Insight',
};

const ETHICS_COPY: Record<string, string> = {
  clear: 'Nothing in this brief crossed a line.',
  flagged: 'One point needs a quick human check before work starts.',
  needs_review: 'A specialist should read this before anything starts.',
  declined: 'This request was declined on ethical grounds.',
};

const BY_LABELS: Record<string, string> = { ai: 'AI', expert: 'Specialist', client: 'You' };
const OWNER_LABELS: Record<string, string> = {
  ai: 'AI does the phases it can',
  expert: 'Specialists do the phases',
  both: 'AI and specialists together',
};

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function rows(value: unknown): Row[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is Row => Boolean(item) && typeof item === 'object' && !Array.isArray(item));
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function money(amount: number, currency: string): string {
  return `${currency || 'EUR'} ${Math.round(amount).toLocaleString('en-US')}`;
}

function estimatePrice(estimate: Row): string {
  const currency = str(estimate.currency) || 'EUR';
  const low = num(estimate.low);
  const high = num(estimate.high);
  if (low === null) return '';
  if (high === null) return money(low, currency);
  return `${money(low, currency)} – ${money(high, currency).replace(/^[A-Z]{3}\s/, '')}`;
}

function estimateNote(kind: string): string {
  switch (kind) {
    case 'fixed':
      return 'Fixed first cut';
    case 'range':
      return 'First range, pinned after discovery';
    case 'discovery_sprint':
      return 'Discovery sprint first, then a fixed build price';
    case 'reality_check':
      return 'What this realistically costs to do properly';
    default:
      return '';
  }
}

function BlockHeading({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs uppercase tracking-[0.2em] text-copper">{children}</p>
  );
}

function EvidenceLine({ finding, sources }: { finding: Row; sources: Row[] }) {
  const evidence = rows(finding.evidence);
  const labels = evidence.map((item) => {
    const source = sources.find((candidate) => str(candidate.id) === str(item.sourceId));
    if (source) return str(source.label).slice(0, 90);
    const url = str(item.url);
    return url ? url.replace(/^https?:\/\//, '').slice(0, 90) : '';
  }).filter(Boolean);

  if (labels.length === 0) return null;
  return (
    <p className="mt-2 text-xs text-muted">
      Based on: <span className="text-foreground/70">{labels[0]}</span>
    </p>
  );
}

export function BlueprintDocumentView({
  document,
  beforeEstimate,
}: {
  document: BlueprintDocument;
  // Master brief 4.10: the default gate position (`before_price`) sits right
  // before the Estimate block opens. The flow passes the save card in here so
  // the price never appears before the ask; without a gate (or in lanes with
  // no estimate) it simply renders where the estimate would be.
  beforeEstimate?: ReactNode;
}) {
  const lane = str(document.lane);
  const presentation = LANE_PRESENTATION[lane] ?? { label: lane, tone: 'border-line text-muted' };
  const sources = rows(document.sources);
  const findings = rows(document.findings);
  const blocks = rows(document.blocks);
  const quickWins = rows(document.quickWins);
  const ethics = (document.ethics ?? { status: 'clear', checks: [] }) as unknown as Row;
  const checks = rows(ethics.checks);
  const clarify = document.clarifyingQuestion as Row | null;

  const vision = blocks.find((block) => str(block.type) === 'vision');
  const architecture = blocks.find((block) => str(block.type) === 'architecture');
  const roadmap = blocks.find((block) => str(block.type) === 'roadmap');
  const estimate = blocks.find((block) => str(block.type) === 'estimate');
  const phases =
    roadmap && roadmap.phases && typeof roadmap.phases === 'object' && !Array.isArray(roadmap.phases)
      ? (roadmap.phases as Row)
      : {};

  return (
    <article className="space-y-6" aria-label="Your blueprint">
      <header className="rounded-2xl border border-line bg-panel p-6">
        <div className="flex flex-wrap items-center gap-3">
          <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${presentation.tone}`}>
            {presentation.label}
          </span>
          {document.confidence ? (
            <span className="text-xs text-muted">{str(document.confidence).replace('_', ' ')} confidence</span>
          ) : null}
        </div>
        <p className="mt-4 font-serif text-2xl leading-snug text-foreground">{str(document.mirror)}</p>
        {clarify ? (
          <div className="mt-5 rounded-xl border border-line bg-panel-2 p-4">
            <p className="text-xs font-semibold text-copper">One question we&apos;d ask</p>
            <p className="mt-1 text-sm text-foreground">{str(clarify.text)}</p>
            {rows(clarify.options).length > 0 ? (
              <ul className="mt-2 space-y-1">
                {rows(clarify.options).map((option, index) => (
                  <li key={index} className="text-sm text-muted">
                    {str(option)}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </header>

      {findings.length > 0 ? (
        <section aria-label="Findings">
          <BlockHeading>What we see</BlockHeading>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {findings.map((finding, index) => (
              <div key={str(finding.id) || index} className="rounded-2xl border border-line bg-panel p-4">
                <p className="text-xs uppercase tracking-[0.15em] text-copper">
                  {FINDING_LABELS[str(finding.kind)] ?? 'Note'}
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-foreground">{str(finding.text)}</p>
                <EvidenceLine finding={finding} sources={sources} />
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {vision ? (
        <section className="rounded-2xl border border-line bg-panel p-6" aria-label="The vision">
          <BlockHeading>The vision</BlockHeading>
          <h2 className="mt-2 font-serif text-xl text-foreground">{str(vision.headline)}</h2>
          <dl className="mt-4 grid gap-4 sm:grid-cols-3">
            <div>
              <dt className="text-xs uppercase tracking-[0.15em] text-muted">Outcome</dt>
              <dd className="mt-1 text-sm text-foreground">{str(vision.outcome)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.15em] text-muted">For whom</dt>
              <dd className="mt-1 text-sm text-foreground">{str(vision.audience)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-[0.15em] text-muted">Success looks like</dt>
              <dd className="mt-1 text-sm text-foreground">{str(vision.successMetric)}</dd>
            </div>
          </dl>
        </section>
      ) : null}

      {architecture ? (
        <section className="rounded-2xl border border-line bg-panel p-6" aria-label="How it's built">
          <BlockHeading>How it&apos;s built</BlockHeading>
          <h2 className="mt-2 font-serif text-xl text-foreground">{str(architecture.headline)}</h2>
          <ul className="mt-4 space-y-3">
            {rows(architecture.components).map((component, index) => (
              <li key={index} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-sm font-semibold text-foreground">{str(component.name)}</span>
                <span className="text-sm text-muted">{str(component.role)}</span>
                <span className="rounded-full border border-line px-2 py-0.5 text-xs text-muted">
                  {BY_LABELS[str(component.by)] ?? str(component.by)}
                </span>
              </li>
            ))}
          </ul>
          {rows(architecture.flow).length > 0 ? (
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
              {rows(architecture.flow).map((step, index) => (
                <span key={index} className="flex items-center gap-2 text-xs text-muted">
                  {index > 0 ? <span aria-hidden="true" className="text-ember">→</span> : null}
                  <span className="rounded-lg bg-panel-2 px-2 py-1">{str(step.from)} → {str(step.to)}</span>
                </span>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      {roadmap ? (
        <section className="rounded-2xl border border-line bg-panel p-6" aria-label="The plan">
          <BlockHeading>The plan</BlockHeading>
          <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-serif text-xl text-foreground">{str(roadmap.headline)}</h2>
            <span className="text-sm font-semibold text-ember">{str(roadmap.totalDuration)}</span>
          </div>
          <ol className="mt-4 grid gap-3 sm:grid-cols-5">
            {['plan', 'design', 'build', 'qa', 'launch'].map((key, index) => {
              const phase = phases[key] as Row | undefined;
              if (!phase) return null;
              return (
                <li key={key} className="rounded-xl border border-line bg-panel-2 p-3">
                  <p className="text-xs text-muted">{index + 1}. {str(phase.label)}</p>
                  <p className="mt-1 text-xs font-semibold text-foreground">{str(phase.duration)}</p>
                  <p className="mt-1 text-xs leading-relaxed text-muted">{str(phase.deliverable)}</p>
                </li>
              );
            })}
          </ol>
          <p className="mt-3 text-xs text-muted">{OWNER_LABELS[str(roadmap.owner)] ?? ''}</p>
        </section>
      ) : null}

      {beforeEstimate}

      {estimate ? (
        <section className="rounded-2xl border border-ember/30 bg-panel p-6" aria-label="The estimate">
          <BlockHeading>The estimate</BlockHeading>
          <div className="mt-2 flex flex-wrap items-baseline gap-3">
            <span className="font-serif text-3xl text-foreground">{estimatePrice(estimate)}</span>
            <span className="rounded-full border border-ember/40 px-2.5 py-0.5 text-xs font-semibold text-ember">
              AI draft, not final
            </span>
          </div>
          <p className="mt-1 text-sm text-muted">{estimateNote(str(estimate.kind))}</p>

          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs uppercase tracking-[0.15em] text-copper">Included</p>
              <ul className="mt-2 space-y-1">
                {rows(estimate.included).map((item, index) => (
                  <li key={index} className="text-sm text-foreground">✓ {str(item)}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.15em] text-muted">Not included</p>
              <ul className="mt-2 space-y-1">
                {rows(estimate.notIncluded).map((item, index) => (
                  <li key={index} className="text-sm text-muted">— {str(item)}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.15em] text-muted">Assumptions</p>
              <ul className="mt-2 space-y-1">
                {rows(estimate.assumptions).map((item, index) => (
                  <li key={index} className="text-sm text-muted">{str(item)}</li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      ) : null}

      {quickWins.length > 0 ? (
        <section aria-label="Quick wins">
          <BlockHeading>Do this first</BlockHeading>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {quickWins.map((win, index) => (
              <div key={str(win.id) || index} className="rounded-2xl border border-line bg-panel p-4">
                <p className="text-sm font-semibold text-foreground">{str(win.label)}</p>
                <p className="mt-1 text-xs text-muted">{str(win.kind)}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <footer className="rounded-2xl border border-line bg-panel-2 p-5">
        <p className="text-sm text-foreground">
          {ETHICS_COPY[str(ethics.status)] ?? ''}
          {checks.length > 0 ? ` ${checks.filter((check) => str(check.result) === 'flag').length} of ${checks.length} principles flagged.` : ''}
        </p>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          Drafted by AI from your description alone — every claim above traces back to what you
          wrote, and the price is a first range, not a contract. We make no guarantees before a
          human has scoped it with you.
        </p>
      </footer>
    </article>
  );
}
