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
import { RoleBadge } from "@/components/role-badge";

const field =
  "w-full rounded-lg border border-line bg-background px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted";

// What people can publish here, and the first words of each so nobody starts from a blank box.
const STARTERS: [string, string][] = [
  ["My profile", "I am a freelance "],
  ["A gig", "I offer "],
  ["A product", "I am selling "],
  ["A tool", "I built a tool that "],
  ["A startup launch", "We are launching "],
  ["A request", "I need "],
];

type Research = { sources: { url: string; title: string; ok: boolean }[]; found: string[]; tips: string[] };

type Draft = { kind: string; category: string; title: string; description: string; currency: string; budgetMin: string; budgetMax: string };

function posted(iso: string | undefined) {
  if (!iso) return "";
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return "just now";
  if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
  if (mins < 43200) return `${Math.round(mins / 1440)}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

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

// Trade: say what you offer or need in your own words, check the listing it makes, publish. Below, a calm list of
// what others and BrandForge itself have put up.
export function TradeCenter() {
  const { openLogin } = useLogin();
  const [listings, setListings] = useState<ListingView[] | null>(null);
  const [pending, setPending] = useState(false);
  const [editing, setEditing] = useState<ListingView | null>(null);
  const [contacting, setContacting] = useState<ListingView | null>(null);
  const [mine, setMine] = useState<ListingView[]>([]);

  // Describe-it flow
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  // What the writer read and learned while making the draft, shown next to it.
  const [research, setResearch] = useState<Research | null>(null);
  const [making, setMaking] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [published, setPublished] = useState<{ conversationId: string | null } | null>(null);
  const router = useRouter();

  const loadMine = useCallback(async () => {
    try {
      const response = await fetchAuthed("/api/trade?mine=1");
      const data = await response.json().catch(() => ({}));
      setMine(response.ok ? (data.listings ?? []) : []);
    } catch {
      setMine([]);
    }
  }, []);

  const load = useCallback(async () => {
    void loadMine();
    try {
      const response = await fetchAuthed("/api/trade");
      const data = await response.json().catch(() => ({}));
      setListings(response.ok ? (data.listings ?? []) : []);
      setPending(Boolean(data.pending));
    } catch {
      setListings([]);
    }
  }, [loadMine]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function makeDraft(words: string) {
    if (words.trim().length < 12) {
      setError("Say a little more, one or two sentences.");
      return;
    }
    setMaking(true);
    setError(null);
    setPublished(null);
    try {
      const response = await fetch("/api/trade/draft", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: words }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "Could not make a listing from that. Try again.");
        return;
      }
      setDraft(data.draft as Draft);
      setResearch((data.research as Research | undefined) ?? null);
    } catch {
      setError("Connection problem. Try again.");
    } finally {
      setMaking(false);
    }
  }

  // Coming from the chat's "Hire or get hired": the words typed there arrive here and turn into a listing.
  useEffect(() => {
    try {
      const carried = window.localStorage.getItem("bf:trade-describe");
      if (carried === null) return;
      window.localStorage.removeItem("bf:trade-describe");
      if (carried.trim().length >= 12) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- the carried words are only readable in the browser
        setText(carried);
        void makeDraft(carried);
      }
    } catch {
      /* storage blocked: the box simply starts empty */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- this runs once, when the page opens
  }, []);

  // The chat that stays this listing's main assistant (made the first time, reopened after).
  async function openAssistant(l: ListingView) {
    try {
      const response = await fetchAuthed(`/api/trade/${l.id}/assistant`, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.conversationId) {
        setError(data.error || "Could not open the assistant. Try again.");
        return;
      }
      router.push(`/chat?conversationId=${data.conversationId}`);
    } catch {
      setError("Connection problem. Try again.");
    }
  }

  async function removeListing(l: ListingView, hard: boolean) {
    const ask = hard ? "Delete this listing for good? This cannot be undone. Its chat stays, but is no longer tied to a listing." : "Close this listing? It stops showing to others. You can reopen it any time.";
    if (!window.confirm(ask)) return;
    await fetchAuthed(`/api/trade/${l.id}${hard ? "?hard=1" : ""}`, { method: "DELETE" });
    void load();
  }

  async function publish() {
    if (!draft) return;
    setPublishing(true);
    setError(null);
    try {
      const response = await fetchAuthed("/api/trade", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(draft) });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) {
        try {
          window.localStorage.setItem("bf:trade-describe", text || draft.description);
        } catch {
          /* ignore */
        }
        openLogin({ reason: "signin", next: "/trade" });
        return;
      }
      if (!response.ok) {
        setError(data.error || "Could not publish. Check the details and try again.");
        return;
      }
      setDraft(null);
      setResearch(null);
      setText("");
      setPublished({ conversationId: (data.conversationId as string | null) ?? null });
      void load();
    } catch {
      setError("Connection problem. Try again.");
    } finally {
      setPublishing(false);
    }
  }

  // One list: your closed listings first (so you can reopen them), then everything open, yours included. Each
  // listing carries its own buttons, so there is no second place to look.
  const closedMine = mine.filter((l) => l.status !== "open");
  const shown = [...closedMine, ...(listings ?? [])];
  const reopen = async (l: ListingView) => {
    await fetchAuthed(`/api/trade/${l.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reopen: true }) });
    void load();
  };

  return (
    <div className="max-w-5xl">
      {/* Describe it */}
      <section aria-label="Publish a listing" className="rounded-2xl border border-line bg-panel p-4 sm:p-5">
        {draft ? (
          <div>
            <p className="font-serif text-lg text-foreground">Here is your listing. Check it, then publish.</p>
            {research && (research.sources.length > 0 || research.found.length > 0) ? (
              <details className="mt-3 rounded-xl border border-line bg-background px-3 py-2 text-sm" open={research.sources.some((source) => !source.ok)}>
                <summary className="cursor-pointer text-muted">
                  {research.sources.some((source) => source.ok) ? "I read " + research.sources.filter((source) => source.ok).map((source) => source.title).join(", ") : "Written from your words"}
                </summary>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
                  {research.found.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                  {research.sources.filter((source) => !source.ok).map((source) => (
                    <li key={source.url}>{source.title} could not be read, so I used your words.</li>
                  ))}
                </ul>
              </details>
            ) : null}
            <div className="mt-3 flex gap-2">
              {(["offer", "request"] as const).map((k) => (
                <button key={k} type="button" aria-pressed={draft.kind === k} onClick={() => setDraft({ ...draft, kind: k })} className={`flex-1 rounded-lg border px-3 py-1.5 text-xs ${draft.kind === k ? "border-ember bg-ember/10 text-foreground" : "border-line text-muted"}`}>
                  {k === "offer" ? "I offer this" : "I need this"}
                </button>
              ))}
            </div>
            <input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} maxLength={100} aria-label="Title" className={`${field} mt-3 font-serif text-base`} />
            <textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} rows={8} maxLength={1200} aria-label="Details" className={`${field} mt-2 leading-relaxed`} />
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value })} aria-label="Category" className={`${field} col-span-2`}>
                {CATEGORIES.map((c: string) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <input value={draft.budgetMin} onChange={(e) => setDraft({ ...draft, budgetMin: e.target.value })} inputMode="decimal" placeholder={`From (${draft.currency})`} aria-label="Price from" className={field} />
              <input value={draft.budgetMax} onChange={(e) => setDraft({ ...draft, budgetMax: e.target.value })} inputMode="decimal" placeholder="To" aria-label="Price to" className={field} />
            </div>
            {research && research.tips.length > 0 ? (
              <p className="mt-2 text-xs text-muted">To make it stronger: {research.tips.join(" · ")}</p>
            ) : null}
            {error ? <p role="alert" className="mt-2 text-xs text-danger">{error}</p> : null}
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button type="button" onClick={() => void publish()} disabled={publishing} className="rounded-xl bg-ember px-5 py-2.5 text-sm font-semibold text-background transition hover:opacity-90 disabled:opacity-60">
                {publishing ? "Publishing…" : "Publish"}
              </button>
              <button type="button" onClick={() => { setDraft(null); setResearch(null); }} className="text-sm text-muted transition hover:text-foreground">
                Change my words
              </button>
            </div>
          </div>
        ) : (
          <div>
            <label htmlFor="trade-describe" className="font-serif text-lg text-foreground">
              What do you offer or need?
            </label>
            <textarea
              id="trade-describe"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={3}
              maxLength={1200}
              placeholder="Say what you offer or need, or paste a link and we read it for you."
              className={`${field} mt-2 text-base`}
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {STARTERS.map(([label, start]) => (
                <button key={label} type="button" onClick={() => setText((current) => (current.trim() ? current : start))} className="rounded-full border border-line px-3 py-1 text-xs text-muted transition hover:border-ember hover:text-foreground">
                  {label}
                </button>
              ))}
            </div>
            {error ? <p role="alert" className="mt-2 text-xs text-danger">{error}</p> : null}
            {published ? (
              <p role="status" className="mt-2 text-sm text-foreground">
                Published. It is in the list below.
                {published.conversationId ? (
                  <>
                    {" "}
                    <Link href={`/chat?conversationId=${published.conversationId}`} className="text-ember underline-offset-2 hover:underline">
                      Open its assistant
                    </Link>
                  </>
                ) : null}
              </p>
            ) : null}
            <div className="mt-3">
              <button type="button" onClick={() => void makeDraft(text)} disabled={making || text.trim().length < 12} className="rounded-xl bg-ember px-5 py-2.5 text-sm font-semibold text-background transition hover:opacity-90 disabled:opacity-50">
                {making ? (/https?:\/\/|\b[a-z0-9-]+\.(?:com|co\.uk|uk|io|app|dev|net|org|gg|ai)\b/i.test(text) ? "Reading your page and writing…" : "Writing your listing…") : "Make my listing"}
              </button>
            </div>
          </div>
        )}
      </section>

      {listings === null ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bf-card h-32 animate-pulse" />
          ))}
        </div>
      ) : shown.length > 0 ? (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {shown.map((l) => (
            <Card key={l.id} listing={l} onContact={setContacting} onEdit={setEditing} onAssistant={openAssistant} onClose={(item) => void removeListing(item, false)} onReopen={(item) => void reopen(item)} onDelete={(item) => void removeListing(item, true)} />
          ))}
        </div>
      ) : (
        <div className="bf-card mt-6 p-6 text-center">
          <p className="font-serif text-lg text-foreground">{pending ? "Trade opens shortly." : "Nothing here yet."}</p>
          {!pending ? <p className="mt-1 text-xs text-muted">Describe what you offer or need above. It takes a minute.</p> : null}
        </div>
      )}

      <p className="mt-8 text-xs text-muted">Agree the details in a private chat and sign a milestone contract. A flat 5% is taken when a milestone is paid. Listing and chatting are free.</p>

      {editing ? <PostForm listing={editing} onClose={() => setEditing(null)} onPosted={() => void load()} /> : null}
      {contacting ? <ContactForm listing={contacting} onClose={() => setContacting(null)} /> : null}
    </div>
  );
}

function Card({ listing: l, onContact, onEdit, onAssistant, onClose, onReopen, onDelete }: { listing: ListingView; onContact: (l: ListingView) => void; onEdit: (l: ListingView) => void; onAssistant: (l: ListingView) => void; onClose: (l: ListingView) => void; onReopen: (l: ListingView) => void; onDelete: (l: ListingView) => void }) {
  const [open, setOpen] = useState(false);
  const long = l.description.length > 150 || l.description.includes("\n");
  const closed = l.status !== "open";
  return (
    <article className={`bf-card flex flex-col p-4 ${closed ? "opacity-70" : ""}`}>
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full text-[10px] font-semibold" style={avatarTone(l.ownerName || l.id)} aria-hidden="true">
          {l.official ? (
            // eslint-disable-next-line @next/next/no-img-element -- bundled local asset at a fixed size
            <img src="/discord-server-icon.png" alt="" className="h-full w-full object-cover" />
          ) : l.ownerAvatar ? (
            // eslint-disable-next-line @next/next/no-img-element -- a small user picture from our own storage
            <img src={l.ownerAvatar} alt="" decoding="async" className="h-full w-full object-cover" />
          ) : (
            initialsFor(l.ownerName || "?")
          )}
        </span>
        <RoleBadge role={l.ownerRole} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{l.ownerName}</span>
        <span className={`shrink-0 text-[11px] ${l.kind === "request" ? "text-ember" : "text-muted"}`}>{closed ? "Closed" : l.kind === "request" ? "Wants" : l.category}</span>
      </div>
      <h3 className="mt-2.5 font-serif text-base leading-snug text-foreground">{l.title}</h3>
      <p className={`mt-1 whitespace-pre-line text-xs leading-relaxed text-muted ${open ? "" : "line-clamp-3"}`}>{l.description}</p>
      {long ? (
        <button type="button" onClick={() => setOpen((value) => !value)} aria-expanded={open} className="mt-1 self-start text-xs text-ember underline-offset-2 hover:underline">
          {open ? "Show less" : "Read more"}
        </button>
      ) : null}
      <div className="flex-1" />
      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-semibold tabular-nums text-foreground">
          {budgetLabel(l, formatMoney)}
          {!l.official && l.createdAt ? <span className="ml-2 text-[11px] font-normal text-muted">{posted(l.createdAt)}</span> : null}
        </p>
        {l.mine ? (
          <button type="button" onClick={() => onAssistant(l)} className="rounded-lg bg-ember px-3 py-1.5 text-xs font-semibold text-background">
            Assistant
          </button>
        ) : (
          <button type="button" onClick={() => onContact(l)} className="rounded-lg bg-ember px-3 py-1.5 text-xs font-semibold text-background">
            {l.kind === "offer" ? "Hire" : "Offer to help"}
          </button>
        )}
      </div>
      {l.mine ? (
        <div className="mt-2 flex items-center gap-1 border-t border-line pt-2 text-xs">
          <button type="button" onClick={() => onEdit(l)} className="rounded px-2 py-1 text-muted hover:text-foreground">Edit</button>
          {closed ? (
            <button type="button" onClick={() => onReopen(l)} className="rounded px-2 py-1 text-ember hover:underline">Reopen</button>
          ) : (
            <button type="button" onClick={() => onClose(l)} className="rounded px-2 py-1 text-muted hover:text-foreground">Close</button>
          )}
          <button type="button" onClick={() => onDelete(l)} className="ml-auto rounded px-2 py-1 text-muted hover:text-danger">Delete</button>
        </div>
      ) : null}
    </article>
  );
}

function PostForm({ onClose, onPosted, listing }: { onClose: () => void; onPosted: () => void; listing: ListingView }) {
  const { openLogin } = useLogin();
  const [kind, setKind] = useState<"offer" | "request">((listing.kind as "offer" | "request") ?? "offer");
  const [category, setCategory] = useState(listing.category ?? "");
  const [title, setTitle] = useState(listing.title ?? "");
  const [description, setDescription] = useState(listing.description ?? "");
  const [currency, setCurrency] = useState(listing.currency ?? "EUR");
  const [budgetMin, setBudgetMin] = useState(listing.budgetMinCents != null ? String(listing.budgetMinCents / 100) : "");
  const [budgetMax, setBudgetMax] = useState(listing.budgetMaxCents != null ? String(listing.budgetMaxCents / 100) : "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetchAuthed(`/api/trade/${listing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, category, title, description, currency, budgetMin, budgetMax }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401) {
        openLogin({ reason: "signin", next: "/trade" });
        return;
      }
      if (!response.ok) {
        setError(data.error || "Could not save the listing.");
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
    <Modal label="Edit listing" onClose={onClose}>
      <div className="mt-3 flex gap-2">
        {(["offer", "request"] as const).map((k) => (
          <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={`flex-1 rounded-lg border px-3 py-1.5 text-xs ${kind === k ? "border-ember bg-ember/10 text-foreground" : "border-line text-muted"}`}>
            {k === "offer" ? "I offer this" : "I need this"}
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
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} className={`${field} mt-1`} />
      </label>
      <label className="mt-3 block text-[11px] text-muted">
        Details
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} maxLength={1200} className={`${field} mt-1`} />
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
          <input value={budgetMin} onChange={(e) => setBudgetMin(e.target.value)} inputMode="decimal" className={`${field} mt-1`} />
        </label>
        <label className="text-[11px] text-muted">
          To
          <input value={budgetMax} onChange={(e) => setBudgetMax(e.target.value)} inputMode="decimal" className={`${field} mt-1`} />
        </label>
      </div>
      {error ? (
        <p className="mt-2 text-xs text-danger" role="alert">
          {error}
        </p>
      ) : null}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-lg border border-line px-3 py-1.5 text-xs text-foreground">
          Cancel
        </button>
        <button type="button" disabled={busy || !category} onClick={() => void submit()} className="rounded-lg bg-ember px-4 py-1.5 text-xs font-semibold text-background disabled:opacity-60">
          Save changes
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
        <p className="mt-2 text-xs text-danger" role="alert">
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
