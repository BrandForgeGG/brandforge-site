"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { fetchAuthed } from "@/lib/browser-auth";
import { formatMoney } from "@/lib/peer-contract.js";
import type { PeerView } from "@/lib/peer-contract-view";

const DEPOSIT_WALLET = process.env.NEXT_PUBLIC_DEPOSIT_WALLET_ADDRESS ?? "";

type Milestone = PeerView["milestones"][number];

const STATUS_WORDS: Record<string, string> = {
  proposed: "Waiting for signatures",
  active: "Signed",
  disputed: "In review",
  completed: "Completed",
  cancelled: "Withdrawn",
};

const MILESTONE_WORDS: Record<Milestone["status"], string> = {
  pending: "Not started",
  submitted: "Submitted",
  released: "Released",
  disputed: "In review",
  refunded: "Refunded",
};

function hoursLeft(iso: string | null): string | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "any moment";
  const hours = Math.ceil(ms / 3600000);
  return hours >= 2 ? `${hours} hours` : "under an hour";
}

export function PeerContractCard({ contractId }: { contractId: string }) {
  const [view, setView] = useState<PeerView | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "private" | "error">("loading");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [tx, setTx] = useState("");
  const [proof, setProof] = useState<Record<number, string>>({});
  const [reason, setReason] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    try {
      const response = await fetchAuthed(`/api/peer-contracts/${contractId}`);
      if (response.status === 403) return setState("private");
      if (!response.ok) return setState("error");
      const data = await response.json();
      setView(data.contract);
      setState("ready");
    } catch {
      setState("error");
    }
  }, [contractId]);

  useEffect(() => {
    // Initial fetch for this card; later changes arrive through act() and the 30s refresh.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- data fetch on mount
    void load();
    const timer = window.setInterval(() => void load(), 30000);
    return () => window.clearInterval(timer);
  }, [load]);

  async function act(action: string, extra: Record<string, unknown> = {}) {
    setBusy(true);
    setNote(null);
    try {
      const response = await fetchAuthed(`/api/peer-contracts/${contractId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setNote(data.error || "That didn't work. Try again.");
      } else {
        setView(data.contract);
      }
    } catch {
      setNote("Connection problem. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const shell = (children: React.ReactNode) => (
    <div className="mt-4 flex justify-center">
      <div className="w-full max-w-xl rounded-2xl border border-ember/30 bg-panel p-4 text-left">{children}</div>
    </div>
  );

  if (state === "loading") return shell(<p className="text-xs text-muted">Loading contract…</p>);
  if (state === "private") {
    return shell(
      <>
        <p className="text-[10px] uppercase tracking-[0.18em] text-copper">Contract</p>
        <p className="mt-1 text-sm text-muted">A private contract between two people in this chat.</p>
      </>,
    );
  }
  if (state === "error" || !view) {
    return shell(
      <p className="text-xs text-muted">
        This contract could not be loaded.{" "}
        <button type="button" className="underline" onClick={() => void load()}>
          Try again
        </button>
      </p>,
    );
  }

  const side = view.viewerSide as "payer" | "payee" | null;
  const mySigned = side ? Boolean(view.signatures[side]) : false;
  const fee = view.feePercent;
  const payeeTakes = formatMoney(
    Math.round(view.totalCents * (1 - fee / 100)),
    view.currency,
  );

  return shell(
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.18em] text-copper">Contract</p>
          <p className="mt-1 truncate font-serif text-lg text-foreground">{view.title}</p>
          <p className="mt-0.5 text-xs text-muted">
            {view.payer.name} pays · {view.payee.name} delivers
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-line bg-overlay px-2.5 py-0.5 text-[11px] text-muted">
          {STATUS_WORDS[view.status] ?? view.status}
        </span>
      </div>

      <p className="mt-3 text-lg tabular-nums text-foreground">{view.totalLabel}</p>
      <p className="text-[11px] text-muted">
        BrandForge fee {fee}% on each release, taken from the person delivering. They receive about {payeeTakes}.
      </p>

      <details className="bf-fold mt-3">
        <summary className="cursor-pointer text-xs text-muted">What is included</summary>
        <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-foreground">{view.scope}</p>
        {view.dueDate ? <p className="mt-2 text-[11px] text-muted">Due {view.dueDate}</p> : null}
      </details>

      <ol className="mt-3 space-y-2">
        {view.milestones.map((m, index) => {
          const left = hoursLeft(m.autoReleaseAt);
          const isNext =
            m.status === "pending" && view.milestones.slice(0, index).every((p) => p.status === "released" || p.status === "refunded");
          return (
            <li key={index} className="rounded-xl border border-line bg-background/40 p-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="min-w-0 truncate text-sm text-foreground">{m.title}</p>
                <p className="shrink-0 text-xs tabular-nums text-muted">{formatMoney(m.amountCents, view.currency)}</p>
              </div>
              <p className="mt-0.5 text-[11px] text-muted">
                {MILESTONE_WORDS[m.status]}
                {m.status === "submitted" && left ? ` · releases automatically in ${left} unless the payer objects` : ""}
              </p>
              {m.proofUrl ? (
                <a href={m.proofUrl} target="_blank" rel="noopener noreferrer nofollow" className="mt-1 inline-block text-[11px] text-ember underline">
                  View the work
                </a>
              ) : null}
              {m.status === "disputed" && m.note ? <p className="mt-1 text-[11px] text-muted">Issue raised: {m.note}</p> : null}

              {side === "payee" && isNext && view.fundingStatus === "funded" ? (
                <div className="mt-2 flex gap-2">
                  <input
                    value={proof[index] ?? ""}
                    onChange={(e) => setProof({ ...proof, [index]: e.target.value })}
                    placeholder="Link to the finished work"
                    aria-label={`Link to the finished work for ${m.title}`}
                    className="min-w-0 flex-1 rounded-lg border border-line bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted"
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void act("submit_milestone", { index, proofUrl: proof[index] ?? "" })}
                    className="rounded-lg bg-ember px-3 py-1.5 text-xs font-semibold text-background disabled:opacity-60"
                  >
                    Submit
                  </button>
                </div>
              ) : null}

              {side === "payer" && m.status === "submitted" ? (
                <div className="mt-2 space-y-2">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void act("approve_milestone", { index })}
                      className="rounded-lg bg-ember px-3 py-1.5 text-xs font-semibold text-background disabled:opacity-60"
                    >
                      Approve and release
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={reason[index] ?? ""}
                      onChange={(e) => setReason({ ...reason, [index]: e.target.value })}
                      placeholder="Something wrong? Say what"
                      aria-label={`What is wrong with ${m.title}`}
                      className="min-w-0 flex-1 rounded-lg border border-line bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted"
                    />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void act("dispute_milestone", { index, reason: reason[index] ?? "" })}
                      className="rounded-lg border border-line px-3 py-1.5 text-xs text-foreground disabled:opacity-60"
                    >
                      Raise an issue
                    </button>
                  </div>
                </div>
              ) : null}

              {view.viewerIsStaff && m.status === "disputed" ? (
                <div className="mt-2 flex gap-2">
                  <button type="button" disabled={busy} onClick={() => void act("resolve_dispute", { index, outcome: "release" })} className="rounded-lg bg-ember px-3 py-1.5 text-xs font-semibold text-background disabled:opacity-60">
                    Release to delivering side
                  </button>
                  <button type="button" disabled={busy} onClick={() => void act("resolve_dispute", { index, outcome: "refund" })} className="rounded-lg border border-line px-3 py-1.5 text-xs text-foreground disabled:opacity-60">
                    Refund the payer
                  </button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>

      {view.status === "proposed" && side ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {!mySigned ? (
            <button type="button" disabled={busy} onClick={() => void act("accept")} className="rounded-lg bg-ember px-3 py-1.5 text-xs font-semibold text-background disabled:opacity-60">
              Accept and sign
            </button>
          ) : (
            <span className="text-[11px] text-trust-light">✓ You signed</span>
          )}
          <button type="button" disabled={busy} onClick={() => setEditing(true)} className="rounded-lg border border-line px-3 py-1.5 text-xs text-foreground">
            Change terms
          </button>
          <button type="button" disabled={busy} onClick={() => void act("cancel")} className="rounded-lg border border-line px-3 py-1.5 text-xs text-muted">
            Withdraw
          </button>
        </div>
      ) : null}

      {view.status === "active" && view.fundingStatus === "none" && side === "payer" ? (
        <div className="mt-3 rounded-xl border border-line p-3">
          <p className="text-xs text-foreground">Fund the contract to start the work.</p>
          {DEPOSIT_WALLET ? (
            <p className="mt-1 break-all text-[11px] text-muted">
              Send {view.totalLabel} to <span className="select-all text-foreground">{DEPOSIT_WALLET}</span>, then paste the transaction reference.
            </p>
          ) : (
            <p className="mt-1 text-[11px] text-muted">Send the total to the BrandForge deposit wallet, then paste the transaction reference.</p>
          )}
          <div className="mt-2 flex gap-2">
            <input
              value={tx}
              onChange={(e) => setTx(e.target.value)}
              placeholder="Transaction reference"
              aria-label="Transaction reference"
              className="min-w-0 flex-1 rounded-lg border border-line bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-muted"
            />
            <button type="button" disabled={busy || tx.trim().length < 6} onClick={() => void act("submit_funding", { tx })} className="rounded-lg bg-ember px-3 py-1.5 text-xs font-semibold text-background disabled:opacity-60">
              I have paid
            </button>
          </div>
        </div>
      ) : null}

      {view.fundingStatus === "verifying" ? (
        <div className="mt-3 rounded-xl border border-line p-3">
          <p className="text-xs text-muted">The deposit is being checked. Work starts once it is confirmed.</p>
          {view.viewerIsStaff ? (
            <div className="mt-2 flex items-center gap-2">
              <span className="min-w-0 truncate text-[11px] text-muted">{view.fundingTx}</span>
              <button type="button" disabled={busy} onClick={() => void act("verify_funding", { approve: true })} className="rounded-lg bg-ember px-3 py-1.5 text-xs font-semibold text-background disabled:opacity-60">
                Mark funded
              </button>
              <button type="button" disabled={busy} onClick={() => void act("verify_funding", { approve: false })} className="rounded-lg border border-line px-3 py-1.5 text-xs text-foreground disabled:opacity-60">
                Reject
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {view.fundingStatus === "funded" && view.status === "active" && side === "payee" && !view.milestones.some((m) => m.status !== "pending") ? (
        <p className="mt-3 text-[11px] text-trust-light">Funded. You can start the first milestone.</p>
      ) : null}

      {note ? (
        <p className="mt-2 text-[11px] text-ember" role="alert">
          {note}
        </p>
      ) : null}

      {editing ? (
        <PeerContractForm
          conversationId={view.conversationId}
          reviseId={view.id}
          initial={view}
          onClose={() => setEditing(false)}
          onSaved={(next) => {
            setView(next);
            setEditing(false);
          }}
        />
      ) : null}
    </>,
  );
}

type FormProps = {
  conversationId: string;
  onClose: () => void;
  onSaved?: (view: PeerView) => void;
  reviseId?: string;
  initial?: PeerView;
};

export function PeerContractForm({ conversationId, onClose, onSaved, reviseId, initial }: FormProps) {
  const [people, setPeople] = useState<{ userId: string; name: string }[]>([]);
  const [fee, setFee] = useState(5);
  const [counterpartyId, setCounterpartyId] = useState("");
  const [myRole, setMyRole] = useState<"payer" | "payee">("payer");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [scope, setScope] = useState(initial?.scope ?? "");
  const [currency, setCurrency] = useState(initial?.currency ?? "EUR");
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? "");
  const [rows, setRows] = useState<{ title: string; amount: string }[]>(
    initial?.milestones.map((m) => ({ title: m.title, amount: String(m.amountCents / 100) })) ?? [{ title: "", amount: "" }],
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Portal target only exists in the browser.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount flag for createPortal
    setMounted(true);
    if (reviseId) return;
    void (async () => {
      try {
        const response = await fetchAuthed(`/api/peer-contracts?conversationId=${conversationId}&people=1`);
        if (!response.ok) return;
        const data = await response.json();
        setPeople(data.people ?? []);
        if (typeof data.feePercent === "number") setFee(data.feePercent);
        if (data.people?.[0]) setCounterpartyId(data.people[0].userId);
      } catch {
        /* the form shows its empty state */
      }
    })();
  }, [conversationId, reviseId]);

  const totalCents = rows.reduce((sum, r) => {
    const n = Math.round(Number(String(r.amount).replace(",", ".")) * 100);
    return sum + (Number.isFinite(n) && n > 0 ? n : 0);
  }, 0);

  async function submit() {
    setBusy(true);
    setError(null);
    const payload = { title, scope, currency, dueDate: dueDate || null, milestones: rows };
    try {
      const response = reviseId
        ? await fetchAuthed(`/api/peer-contracts/${reviseId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "revise", ...payload }),
          })
        : await fetchAuthed("/api/peer-contracts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ conversationId, counterpartyId, myRole, ...payload }),
          });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "Could not save the contract.");
        return;
      }
      onSaved?.(data.contract);
      onClose();
    } catch {
      setError("Connection problem. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!mounted) return null;

  const input =
    "w-full rounded-lg border border-line bg-background px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted";

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/50 p-3 sm:items-center" role="dialog" aria-modal="true" aria-label={reviseId ? "Change contract terms" : "Create a contract"}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-line bg-panel p-4">
        <div className="flex items-center justify-between">
          <p className="font-serif text-lg text-foreground">{reviseId ? "Change the terms" : "New contract"}</p>
          <button type="button" onClick={onClose} aria-label="Close" className="text-muted hover:text-foreground">
            ✕
          </button>
        </div>

        {!reviseId ? (
          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="text-[11px] text-muted">
              With
              <select value={counterpartyId} onChange={(e) => setCounterpartyId(e.target.value)} className={`${input} mt-1`}>
                {people.length === 0 ? <option value="">Invite someone to this chat first</option> : null}
                {people.map((p) => (
                  <option key={p.userId} value={p.userId}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[11px] text-muted">
              I am
              <select value={myRole} onChange={(e) => setMyRole(e.target.value as "payer" | "payee")} className={`${input} mt-1`}>
                <option value="payer">Paying for the work</option>
                <option value="payee">Doing the work</option>
              </select>
            </label>
          </div>
        ) : null}

        <label className="mt-3 block text-[11px] text-muted">
          Title
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="30-second launch video" className={`${input} mt-1`} />
        </label>
        <label className="mt-3 block text-[11px] text-muted">
          What is delivered
          <textarea value={scope} onChange={(e) => setScope(e.target.value)} rows={3} maxLength={4000} placeholder="One 30-second video, two rounds of edits, captions included." className={`${input} mt-1`} />
        </label>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="text-[11px] text-muted">
            Currency
            <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={`${input} mt-1`}>
              <option>EUR</option>
              <option>USD</option>
              <option>GBP</option>
            </select>
          </label>
          <label className="text-[11px] text-muted">
            Due date (optional)
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={`${input} mt-1`} />
          </label>
        </div>

        <p className="mt-3 text-[11px] text-muted">Milestones</p>
        <div className="mt-1 space-y-2">
          {rows.map((row, i) => (
            <div key={i} className="flex gap-2">
              <input value={row.title} onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, title: e.target.value } : r)))} placeholder={`Milestone ${i + 1}`} aria-label={`Milestone ${i + 1} title`} className={input} />
              <input value={row.amount} onChange={(e) => setRows(rows.map((r, j) => (j === i ? { ...r, amount: e.target.value } : r)))} placeholder="0" inputMode="decimal" aria-label={`Milestone ${i + 1} amount`} className={`${input} w-24 shrink-0`} />
              {rows.length > 1 ? (
                <button type="button" onClick={() => setRows(rows.filter((_, j) => j !== i))} aria-label={`Remove milestone ${i + 1}`} className="text-muted hover:text-foreground">
                  ✕
                </button>
              ) : null}
            </div>
          ))}
        </div>
        {rows.length < 8 ? (
          <button type="button" onClick={() => setRows([...rows, { title: "", amount: "" }])} className="mt-2 text-xs text-ember underline">
            Add a milestone
          </button>
        ) : null}

        <p className="mt-3 text-sm tabular-nums text-foreground">Total {formatMoney(totalCents, currency)}</p>
        <p className="text-[11px] text-muted">
          BrandForge keeps a flat {fee}% of each milestone when it is released. It is taken from the person doing the work and never changes after both people sign.
        </p>

        {error ? (
          <p className="mt-2 text-xs text-ember" role="alert">
            {error}
          </p>
        ) : null}

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-line px-3 py-1.5 text-xs text-foreground">
            Cancel
          </button>
          <button type="button" disabled={busy || (!reviseId && !counterpartyId)} onClick={() => void submit()} className="rounded-lg bg-ember px-4 py-1.5 text-xs font-semibold text-background disabled:opacity-60">
            {reviseId ? "Save changes" : "Send contract"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
