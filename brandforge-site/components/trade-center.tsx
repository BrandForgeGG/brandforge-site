"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLogin } from "@/components/login-dialog";
import { createPortal } from "react-dom";
import { fetchAuthed } from "@/lib/browser-auth";
import { CATEGORIES } from "@/lib/trade.js";
import { budgetLabel } from "@/lib/trade.js";
import { formatMoney } from "@/lib/peer-contract.js";
import type { ListingView } from "@/lib/trade-view";
import { avatarTone, initialsFor } from "@/lib/identity-display";

const field =
  "w-full rounded-lg border border-line bg-background px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted";

function Modal({ label, onClose, children }: { label: string; onClose: () => void; children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- portal target exists only in the browser
    setMounted(true);
  }, []);
  if (!mounted) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/50 p-3 sm:items-center" role="dialog" aria-modal="true" aria-label={label}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-line bg-panel p-4">
        <div className="flex items-center justify-between">
          <p className="font-serif text-lg text-foreground">{label}</p>
          <button type="button" onClick={onClose} aria-label="Close" className="text-muted hover:text-foreground">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function TradeCenter() {
  const [listings, setListings] = useState<ListingView[] | null>(null);
  const [pending, setPending] = useState(false);
  const [isSpecialist, setIsSpecialist] = useState(false);
  const [kind, setKind] = useState<"" | "offer" | "request">("");
  const [category, setCategory] = useState("");
  const [q, setQ] = useState("");
  const [posting, setPosting] = useState(false);
  const [editing, setEditing] = useState<ListingView | null>(null);
  const [contacting, setContacting] = useState<ListingView | null>(null);
  const [mine, setMine] = useState<ListingView[]>([]);

  const loadMine = useCallback(async () => {
    try {
      const response = await fetchAuthed('/api/trade?mine=1');
      const data = await response.json().catch(() => ({}));
      setMine(response.ok ? (data.listings ?? []) : []);
    } catch {
      setMine([]);
    }
  }, []);

  const load = useCallback(async () => {
    void loadMine();
    const params = new URLSearchParams();
    if (kind) params.set("kind", kind);
    if (category) params.set("category", category);
    if (q.trim()) params.set("q", q.trim());
    try {
      const response = await fetchAuthed(`/api/trade?${params.toString()}`);
      const data = await response.json().catch(() => ({}));
      setListings(response.ok ? (data.listings ?? []) : []);
      setPending(Boolean(data.pending));
      setIsSpecialist(Boolean(data.viewer?.isSpecialist));
    } catch {
      setListings([]);
    }
  }, [kind, category, q, loadMine]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), q ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [load, q]);

  const shown = listings ?? [];
  const steps: [string, string, string][] = [
    ['List', 'Say what you offer or need', 'M4 5h12M4 10h12M4 15h7'],
    ['Chat', 'Agree the details in private', 'M4 5.5h12v7.5H9.5L6 16v-3H4z'],
    ['Sign', 'A milestone contract, in the chat', 'M5 15l2-.5 7-7-1.5-1.5-7 7zM12 5.5l1.5 1.5'],
    ['Get paid', 'Money moves as each milestone lands', 'M4 7h11l-3-3M16 13H5l3 3'],
  ];

  return (
    <div className="max-w-5xl">
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setKind("offer")}
          aria-pressed={kind === "offer"}
          className={`group rounded-2xl border p-4 text-left transition ${kind === "offer" ? "border-ember bg-ember/10" : "border-line bg-panel hover:border-ember"}`}
        >
          <p className="font-serif text-lg text-foreground">I want to hire</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">Browse people who offer a service. Message one, agree the work, sign a contract.</p>
        </button>
        <button
          type="button"
          onClick={() => setKind("request")}
          aria-pressed={kind === "request"}
          className={`group rounded-2xl border p-4 text-left transition ${kind === "request" ? "border-ember bg-ember/10" : "border-line bg-panel hover:border-ember"}`}
        >
          <p className="font-serif text-lg text-foreground">I want work</p>
          <p className="mt-1 text-xs leading-relaxed text-muted">See what people need done. Approved specialists can offer to help.</p>
        </button>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <div className="-mx-1 flex max-w-full gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label="Category">
          {["", ...CATEGORIES].map((c: string) => (
            <button
              key={c || "all"}
              type="button"
              aria-pressed={category === c}
              onClick={() => setCategory(c)}
              className={`shrink-0 rounded-full border px-3 py-1 text-xs transition ${category === c ? "border-ember bg-ember/10 text-foreground" : "border-line text-muted hover:text-foreground"}`}
            >
              {c || "Everything"}
            </button>
          ))}
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search listings" className={`${field} w-40`} />
        {kind ? (
          <button type="button" className="text-xs text-muted underline-offset-2 hover:text-foreground hover:underline" onClick={() => setKind("")}>
            Show both
          </button>
        ) : null}
        <button type="button" onClick={() => setPosting(true)} className="ml-auto rounded-lg bg-ember px-3 py-1.5 text-xs font-semibold text-background">
          Post a listing
        </button>
      </div>
      {listings ? <p className="mt-2 text-xs text-muted" aria-live="polite">{shown.length} {shown.length === 1 ? "listing" : "listings"}</p> : null}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {listings === null
          ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="bf-card h-40 animate-pulse" />)
          : shown.map((l) => (
              <article key={l.id} className="bf-card flex flex-col p-4">
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold" style={avatarTone(l.ownerName || l.id)} aria-hidden="true">
                    {initialsFor(l.ownerName || "?")}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-foreground">{l.ownerName}</span>
                  {l.mine ? <span className="rounded-full bg-overlay px-2 py-0.5 text-muted">Yours</span> : null}
                  <span className={`rounded-full border px-2 py-0.5 ${l.kind === "offer" ? "border-trust/30 bg-trust/10 text-trust-light" : "border-ember/40 bg-ember/10 text-ember-light"}`}>
                    {l.kind === "offer" ? "Offers" : "Wants"}
                  </span>
                </div>
                <p className="mt-3 text-[11px] uppercase tracking-[0.12em] text-muted">{l.category}</p>
                <h3 className="mt-0.5 font-serif text-base text-foreground">{l.title}</h3>
                <p className="mt-1 line-clamp-3 flex-1 text-xs leading-relaxed text-muted">{l.description}</p>
                <div className="mt-3 flex items-center justify-between gap-2 border-t border-line pt-3">
                  <p className="min-w-0 truncate text-sm font-semibold tabular-nums text-foreground">{budgetLabel(l, formatMoney)}</p>
                  {l.mine ? (
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setEditing(l)} className="rounded-lg border border-line px-3 py-1.5 text-xs text-muted hover:text-foreground">
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          if (!window.confirm("Close this listing? It stops showing to others. You can reopen it from Your listings.")) return;
                          await fetchAuthed(`/api/trade/${l.id}`, { method: "DELETE" });
                          void load();
                        }}
                        className="rounded-lg border border-line px-3 py-1.5 text-xs text-muted hover:text-foreground"
                      >
                        Close
                      </button>
                    </div>
                  ) : l.kind === "request" && !isSpecialist ? (
                    <Link href="/apply" data-tip="Only approved specialists can answer requests" className="rounded-lg border border-line px-3 py-1.5 text-xs text-foreground transition hover:border-ember">
                      Apply to help
                    </Link>
                  ) : (
                    <button type="button" onClick={() => setContacting(l)} className="rounded-lg bg-ember px-3 py-1.5 text-xs font-semibold text-background">
                      {l.kind === "offer" ? "Hire" : "Offer to help"}
                    </button>
                  )}
                </div>
              </article>
            ))}
      </div>

      {listings && listings.length === 0 ? (
        <div className="bf-card mt-2 p-6 text-center">
          <p className="font-serif text-lg text-foreground">{pending ? "The Trade Center opens shortly." : "Nothing here yet."}</p>
          {!pending ? (
            <>
              <p className="mt-1 text-xs text-muted">Be the first. A listing takes a minute and stays until you close it.</p>
              <button type="button" onClick={() => setPosting(true)} className="mt-3 rounded-lg bg-ember px-4 py-2 text-xs font-semibold text-background">
                Post what you offer or need
              </button>
            </>
          ) : null}
        </div>
      ) : null}

      {mine.length > 0 ? (
        <section aria-label="Your listings" className="mt-8">
          <p className="font-serif text-lg text-foreground">Your listings</p>
          <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-panel">
            {mine.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{l.title}</p>
                  <p className="text-xs text-muted">
                    {l.kind === "offer" ? "Offers" : "Wants"} · {l.category} · <span className={l.status === "open" ? "text-success" : ""}>{l.status === "open" ? "Open" : "Closed"}</span>
                  </p>
                </div>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setEditing(l)} className="rounded-lg border border-line px-3 py-1.5 text-xs text-muted hover:text-foreground">
                    Edit
                  </button>
                  {l.status === "closed" ? (
                    <button
                      type="button"
                      onClick={async () => {
                        await fetchAuthed(`/api/trade/${l.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reopen: true }) });
                        void load();
                      }}
                      className="rounded-lg bg-ember px-3 py-1.5 text-xs font-semibold text-background"
                    >
                      Reopen
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-label="How trading works" className="mt-8 rounded-2xl border border-line bg-panel p-5">
        <p className="font-serif text-lg text-foreground">How a deal goes</p>
        <ol className="mt-4 grid gap-4 sm:grid-cols-4">
          {steps.map(([name, line, path], index) => (
            <li key={name} className="relative flex gap-3 sm:flex-col">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-ember/15 text-ember" aria-hidden="true">
                <svg viewBox="0 0 20 20" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={path} /></svg>
              </span>
              {index < steps.length - 1 ? <span aria-hidden="true" className="absolute right-0 top-3 hidden text-muted sm:block" style={{ right: "-0.9rem" }}>→</span> : null}
              <span>
                <span className="block text-sm font-semibold text-foreground">{name}</span>
                <span className="block text-xs leading-relaxed text-muted">{line}</span>
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-[11px] text-muted">A flat 5% is taken when each milestone is released. Nothing is charged to list or to chat.</p>
      </section>

      {posting ? <PostForm canOffer={isSpecialist} onClose={() => setPosting(false)} onPosted={() => void load()} /> : null}
      {editing ? <PostForm canOffer={isSpecialist} listing={editing} onClose={() => setEditing(null)} onPosted={() => void load()} /> : null}
      {contacting ? <ContactForm listing={contacting} onClose={() => setContacting(null)} /> : null}
    </div>
  );
}

function PostForm({ onClose, onPosted, listing, canOffer }: { onClose: () => void; onPosted: () => void; listing?: ListingView; canOffer: boolean }) {
  const { openLogin } = useLogin();
  const [kind, setKind] = useState<"offer" | "request">((listing?.kind as "offer" | "request") ?? "offer");
  const [category, setCategory] = useState(listing?.category ?? "");
  const [title, setTitle] = useState(listing?.title ?? "");
  const [description, setDescription] = useState(listing?.description ?? "");
  const [currency, setCurrency] = useState(listing?.currency ?? "EUR");
  const [budgetMin, setBudgetMin] = useState(listing?.budgetMinCents != null ? String(listing.budgetMinCents / 100) : "");
  const [budgetMax, setBudgetMax] = useState(listing?.budgetMaxCents != null ? String(listing.budgetMaxCents / 100) : "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetchAuthed(listing ? `/api/trade/${listing.id}` : "/api/trade", {
        method: listing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, category, title, description, currency, budgetMin, budgetMax }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) {
        openLogin({ reason: "signin", next: "/trade" });
        return;
      }
      if (!response.ok) {
        setError(data.error || "Could not post the listing.");
        return;
      }
      onPosted();
      onClose();
    } catch {
      setError("Connection problem. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal label={listing ? "Edit listing" : "Post a listing"} onClose={onClose}>
      <div className="mt-3 flex gap-2">
        {(["offer", "request"] as const).map((k) => (
          <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={`flex-1 rounded-lg border px-3 py-1.5 text-xs ${kind === k ? "border-ember bg-ember/10 text-foreground" : "border-line text-muted"}`}>
            {k === "offer" ? "I offer a service" : "I need work done"}
          </button>
        ))}
      </div>
      {kind === "offer" && !canOffer ? (
        <p className="mt-3 rounded-lg border border-ember/30 bg-ember/10 px-3 py-2 text-xs leading-relaxed text-foreground">
          Offering services is for approved specialists.{" "}
          <Link href="/apply" className="text-ember underline-offset-2 hover:underline">
            Apply in two minutes
          </Link>{" "}
          , or switch to &quot;I need work done&quot;.
        </p>
      ) : null}
      <label className="mt-3 block text-[11px] text-muted">
        Category
        <select value={category} onChange={(e) => setCategory(e.target.value)} className={`${field} mt-1`}>
          <option value="" disabled>
            Choose a category
          </option>
          {CATEGORIES.map((c: string) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      <label className="mt-3 block text-[11px] text-muted">
        Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} placeholder="Short-form video editing for small brands" className={`${field} mt-1`} />
      </label>
      <label className="mt-3 block text-[11px] text-muted">
        Details
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} maxLength={1200} placeholder="What you do or need, turnaround, what is included." className={`${field} mt-1`} />
      </label>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <label className="text-[11px] text-muted">
          Currency
          <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={`${field} mt-1`}>
            <option>EUR</option>
            <option>USD</option>
            <option>GBP</option>
          </select>
        </label>
        <label className="text-[11px] text-muted">
          From
          <input value={budgetMin} onChange={(e) => setBudgetMin(e.target.value)} inputMode="decimal" placeholder="200" className={`${field} mt-1`} />
        </label>
        <label className="text-[11px] text-muted">
          To
          <input value={budgetMax} onChange={(e) => setBudgetMax(e.target.value)} inputMode="decimal" placeholder="600" className={`${field} mt-1`} />
        </label>
      </div>
      {error ? (
        <p className="mt-2 text-xs text-ember" role="alert">
          {error}
        </p>
      ) : null}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-lg border border-line px-3 py-1.5 text-xs text-foreground">
          Cancel
        </button>
        <button type="button" disabled={busy || !category || (kind === "offer" && !canOffer)} onClick={() => void submit()} className="rounded-lg bg-ember px-4 py-1.5 text-xs font-semibold text-background disabled:opacity-60">
          {listing ? "Save changes" : "Post listing"}
        </button>
      </div>
    </Modal>
  );
}

function ContactForm({ listing, onClose }: { listing: ListingView; onClose: () => void }) {
  const router = useRouter();
  const { openLogin } = useLogin();
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetchAuthed(`/api/trade/${listing.id}/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) {
        openLogin({ reason: "signin", next: "/trade" });
        return;
      }
      if (!response.ok) {
        setError(data.error || "Could not send your message.");
        return;
      }
      router.push(`/chat?conversationId=${data.conversationId}`);
    } catch {
      setError("Connection problem. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal label={`Message ${listing.ownerName}`} onClose={onClose}>
      <p className="mt-2 text-xs text-muted">About: {listing.title}</p>
      <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={4} maxLength={1000} placeholder="Say what you need or what you can do, and when." aria-label="Your message" className={`${field} mt-3`} />
      {error ? (
        <p className="mt-2 text-xs text-ember" role="alert">
          {error}
        </p>
      ) : null}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-lg border border-line px-3 py-1.5 text-xs text-foreground">
          Cancel
        </button>
        <button type="button" disabled={busy || message.trim().length < 10} onClick={() => void send()} className="rounded-lg bg-ember px-4 py-1.5 text-xs font-semibold text-background disabled:opacity-60">
          Send and open chat
        </button>
      </div>
    </Modal>
  );
}
