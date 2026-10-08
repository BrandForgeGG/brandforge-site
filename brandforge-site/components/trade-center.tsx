"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import { fetchAuthed } from "@/lib/browser-auth";
import { CATEGORIES } from "@/lib/trade.js";
import { budgetLabel } from "@/lib/trade.js";
import { formatMoney } from "@/lib/peer-contract.js";
import type { ListingView } from "@/lib/trade-view";

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
  const [kind, setKind] = useState<"" | "offer" | "request">("");
  const [category, setCategory] = useState("");
  const [q, setQ] = useState("");
  const [posting, setPosting] = useState(false);
  const [editing, setEditing] = useState<ListingView | null>(null);
  const [contacting, setContacting] = useState<ListingView | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (kind) params.set("kind", kind);
    if (category) params.set("category", category);
    if (q.trim()) params.set("q", q.trim());
    try {
      const response = await fetchAuthed(`/api/trade?${params.toString()}`);
      const data = await response.json().catch(() => ({}));
      setListings(response.ok ? (data.listings ?? []) : []);
      setPending(Boolean(data.pending));
    } catch {
      setListings([]);
    }
  }, [kind, category, q]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), q ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [load, q]);

  return (
    <div className="max-w-5xl">
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["", "All"],
            ["offer", "Services offered"],
            ["request", "Work wanted"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setKind(value)}
            aria-pressed={kind === value}
            className={`rounded-full border px-3 py-1 text-xs transition ${kind === value ? "border-ember bg-ember/10 text-foreground" : "border-line text-muted hover:text-foreground"}`}
          >
            {label}
          </button>
        ))}
        <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category" className={`${field} w-auto`}>
          <option value="">Any category</option>
          {CATEGORIES.map((c: string) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search listings" className={`${field} w-40`} />
        <button type="button" onClick={() => setPosting(true)} className="ml-auto rounded-lg bg-ember px-3 py-1.5 text-xs font-semibold text-background">
          Post a listing
        </button>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        {listings === null
          ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="bf-card h-36 animate-pulse" />)
          : listings.map((l) => (
              <article key={l.id} className="bf-card flex flex-col p-4">
                <div className="flex items-center gap-2 text-[11px]">
                  <span className={`rounded-full border px-2 py-0.5 ${l.kind === "offer" ? "border-trust/30 bg-trust/10 text-trust-light" : "border-ember/40 bg-ember/10 text-ember-light"}`}>
                    {l.kind === "offer" ? "Offers" : "Wants"}
                  </span>
                  <span className="text-muted">{l.category}</span>
                </div>
                <h3 className="mt-2 font-serif text-base text-foreground">{l.title}</h3>
                <p className="mt-1 line-clamp-3 flex-1 text-xs leading-relaxed text-muted">{l.description}</p>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm tabular-nums text-foreground">{budgetLabel(l, formatMoney)}</p>
                    <p className="truncate text-[11px] text-muted">{l.ownerName}</p>
                  </div>
                  {l.mine ? (
                    <div className="flex gap-2">
                      <button type="button" onClick={() => setEditing(l)} className="rounded-lg border border-line px-3 py-1.5 text-xs text-muted hover:text-foreground">
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await fetchAuthed(`/api/trade/${l.id}`, { method: "DELETE" });
                          void load();
                        }}
                        className="rounded-lg border border-line px-3 py-1.5 text-xs text-muted hover:text-foreground"
                      >
                        Close
                      </button>
                    </div>
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
          <p className="text-sm text-foreground">{pending ? "The Trade Center opens shortly." : "No listings match yet."}</p>
          {!pending ? <p className="mt-1 text-xs text-muted">Be the first: post what you offer or what you need.</p> : null}
          <ol className="mx-auto mt-4 flex max-w-md flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-muted" aria-label="How it works">
            {["List", "Chat", "Sign", "Get paid"].map((step, index) => (
              <li key={step} className="flex items-center gap-2">
                <span className="rounded-full border border-line px-2.5 py-1 text-foreground">{step}</span>
                {index < 3 ? <span aria-hidden="true">→</span> : null}
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <p className="mt-4 text-[11px] text-muted">
        Agree the deal in a private chat, then sign a milestone contract there. A flat 5% is taken when each milestone is released.
      </p>

      {posting ? <PostForm onClose={() => setPosting(false)} onPosted={() => void load()} /> : null}
      {editing ? <PostForm listing={editing} onClose={() => setEditing(null)} onPosted={() => void load()} /> : null}
      {contacting ? <ContactForm listing={contacting} onClose={() => setContacting(null)} /> : null}
    </div>
  );
}

function PostForm({ onClose, onPosted, listing }: { onClose: () => void; onPosted: () => void; listing?: ListingView }) {
  const router = useRouter();
  const [kind, setKind] = useState<"offer" | "request">((listing?.kind as "offer" | "request") ?? "offer");
  const [category, setCategory] = useState(listing?.category ?? CATEGORIES[0]);
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
        router.push("/login?next=/trade");
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
      <label className="mt-3 block text-[11px] text-muted">
        Category
        <select value={category} onChange={(e) => setCategory(e.target.value)} className={`${field} mt-1`}>
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
        <button type="button" disabled={busy} onClick={() => void submit()} className="rounded-lg bg-ember px-4 py-1.5 text-xs font-semibold text-background disabled:opacity-60">
          {listing ? "Save changes" : "Post listing"}
        </button>
      </div>
    </Modal>
  );
}

function ContactForm({ listing, onClose }: { listing: ListingView; onClose: () => void }) {
  const router = useRouter();
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
        router.push("/login?next=/trade");
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
