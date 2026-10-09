"use client";

import { useEffect, useRef, useState } from "react";
import { embedActions, showsFundingForm } from "@/lib/embed-actions.js";
import { avatarLabel, avatarTone, initialsFor } from "@/lib/identity-display";
import { isDirectlyReadable } from "@/lib/file-context";
import { RichContent } from "@/components/rich-content";

import { detectDeliverable, KINDS } from "@/lib/deliverable-intent";
import { BlueprintEmbedCard } from "@/components/blueprint/blueprint-embed-card";
import { PeerContractCard } from "@/components/peer-contract-card";

export type ChatEmbedAction =
  | "accept"
  | "decline"
  | "counter"
  | "counter_back"
  | "details"
  | "submit_funding"
  | "accept_contract"
  | "edit_contract";

export type ChatEmbed =
  | {
      type: "proposal";
      proposalId: string;
      status: string;
      title?: string;
      /** Priced-offer snapshot written by the proposals route; absent on old cards. */
      totalAmount?: number;
      currency?: string;
      weeksMin?: number | null;
      weeksMax?: number | null;
      scope?: string | null;
      counterTotalAmount?: number;
      counterWeeksMin?: number;
      counterWeeksMax?: number;
      counterRound?: number;
      counterNote?: string | null;
    }
  | { type: "agreement"; agreementId: string; status: string }
  | { type: "peer_contract"; contractId: string; status: string }
  | { type: "review_request"; conversationId: string; percent?: number; complete?: boolean }
  | {
      type: "blueprint";
      blueprintId: string;
      canEdit?: boolean;
      emailed?: boolean;
      document?: any;
      title?: string;
      body?: string;
    }
  | {
      type: "funding";
      agreementId: string;
      paymentId?: string;
      status?: string;
    };

/** The contract row as the card sees it, including the 0013 signature columns. */
export type ContractSummary = {
  id: string;
  terms: string;
  status: string;
  total_amount?: number;
  currency?: string;
  founder_accepted_at?: string | null;
  team_accepted_at?: string | null;
};

export interface ChatMessage {
  id: string;
  sender: "user" | "ai" | "human" | "system";
  content: string;
  createdAt: string | null;
  editedAt?: string | null;
  streaming?: boolean;
  reactions?: { emoji: string; count: number; reactedByMe: boolean }[];
  artifactData?: {
    path: string;
    name: string;
    size: number;
    contentType: string;
    generated?: boolean;
    caption?: string;
    scene?: number;
  } | null;
  embed?: ChatEmbed | null;
  /**
   * The person behind a non-AI message. Pillar A of the overhaul: no shared "BrandForge Team"
   * author anywhere - every human message is attributed to a named individual who actually
   * wrote it. `null` only for rows written before sender_name was stored.
   */
  senderName?: string | null;
  senderId?: string | null;
  /**
   * User-safe activity labels recorded for real steps of a turn ("Read project context").
   * Progress/status only — never hidden reasoning, never fabricated.
   */
  thoughts?: string[];
  /** Live status while the assistant message is still streaming. */
  status?: string;
}

export function FundingForm({
  messageId,
  disabled,
  onSubmit,
}: {
  messageId: string;
  disabled?: boolean;
  onSubmit: (txHash: string) => void;
}) {
  const [txHash, setTxHash] = useState("");
  return (
    <form
      className="mt-3 flex w-full flex-wrap gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const value = txHash.trim();
        if (!value) return;
        onSubmit(value);
        setTxHash("");
      }}
    >
      <label className="sr-only" htmlFor={`funding-${messageId}`}>
        Transaction hash
      </label>
      <input
        id={`funding-${messageId}`}
        value={txHash}
        onChange={(event) => setTxHash(event.target.value)}
        placeholder="Paste your transaction hash"
        disabled={disabled}
        className="min-w-0 flex-1 rounded-lg border border-line bg-background px-3 py-1.5 text-xs text-foreground placeholder:text-muted disabled:opacity-60"
      />
      <button
        type="submit"
        disabled={disabled || !txHash.trim()}
        className="rounded-lg bg-ember px-3 py-1.5 text-xs font-semibold text-background disabled:opacity-60"
      >
        Submit for verification
      </button>
    </form>
  );
}

// One action card per system message: brief receipt, proposal, contract (the signature
// surface), funding. Extracted into a component because the contract card carries its own
// edit state — the textarea must survive re-renders of the surrounding transcript.
function SystemEmbedCard({
  message,
  canDecide,
  isStaff,
  contract,
  canEdit,
  proposal,
  embedBusy,
  onEmbedAction,
}: {
  message: ChatMessage;
  canDecide?: boolean;
  isStaff?: boolean;
  canEdit?: boolean;
  contract: ContractSummary | null;
  /** Live proposal row: binds action buttons and the status pill to reality. */
  proposal?: { id: string; status: string } | null;
  embedBusy?: boolean;
  onEmbedAction?: (
    embed: ChatEmbed,
    action: ChatEmbedAction,
    value?: string,
  ) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  // Counter round: the form opens in place on the proposal card, same as the contract
  // editor, so the price and timeline are typed where the offer already lives.
  const [countering, setCountering] = useState<null | "counter" | "counter_back">(null);
  const [counterAmount, setCounterAmount] = useState("");
  const [counterWeeks, setCounterWeeks] = useState("");
  const [counterNote, setCounterNote] = useState("");
  const counterAmountValue = Math.floor(Number(counterAmount));
  const counterWeeksValue = Math.floor(Number(counterWeeks));
  const counterValid =
    Number.isFinite(counterAmountValue) &&
    counterAmountValue >= 1 &&
    Number.isFinite(counterWeeksValue) &&
    counterWeeksValue >= 1;

   const embed = message.embed;
   if (!embed) return null;

   // Peer contracts load and act on themselves.
   if (embed.type === "peer_contract") {
     return <PeerContractCard contractId={embed.contractId} />;
   }

   // Handle blueprint embeds
   if (embed.type === "blueprint") {
     return <BlueprintEmbedCard embed={embed} canEdit={canEdit} blueprintId={embed.blueprintId} />;
   }

   // Signature state only binds when the loaded contract IS this card's agreement.
   const ownContract =
     embed.type === "agreement" && contract && contract.id === embed.agreementId
       ? contract
       : null;
  const founderSigned = Boolean(ownContract?.founder_accepted_at);
  const teamSigned = Boolean(ownContract?.team_accepted_at);
  const bothSigned = founderSigned && teamSigned;
  // A card never goes stale: when this card IS the current proposal, its buttons and
  // status pill follow the live row (answering via the panel instantly disarms every
  // older card instead of leaving dead buttons that 409). Older proposals keep their
  // own historical snapshot — their ids never match the live row.
  const liveProposal =
    embed.type === "proposal" && proposal && proposal.id === embed.proposalId
      ? proposal
      : null;
  const liveStatus =
    embed.type === "proposal" ? (liveProposal?.status ?? embed.status) : "";
  const actions = embedActions({
    embed: embed.type === "proposal" ? { ...embed, status: liveStatus } : embed,
    canDecide,
    isStaff,
    contract: ownContract,
  });

  const title =
    embed.type === "proposal"
      ? embed.title || "Proposal ready"
      : embed.type === "agreement"
        ? bothSigned
          ? "Contract signed"
          : founderSigned || teamSigned
            ? "Contract awaiting signatures"
            : "Contract ready to sign"
        : embed.type === "funding"
          ? "Funding action"
          : embed.type === "review_request"
            ? "Brief sent for review"
            : "Project action";

  const signatureBadge = (signed: boolean, label: string) => (
    <span
      className={
        signed
          ? "rounded-full border border-trust/30 bg-trust/10 px-2.5 py-0.5 text-[11px] text-trust-light"
          : "rounded-full border border-line bg-overlay px-2.5 py-0.5 text-[11px] text-muted"
      }
    >
      {signed ? `✓ ${label} signed` : `${label} yet to sign`}
    </span>
  );

  // Short status word for a proposal card. The panel carries the full sentence;
  // the card only needs the state at a glance.
  const proposalStatusLabel = (status?: string): string | null => {
    switch (status) {
      case "pending":
        return "Awaiting decision";
      case "countered":
        return "Countered";
      case "counter_back":
        return "Final offer";
      case "accepted":
        return "Accepted";
      case "declined":
        return "Declined";
      case "changes_requested":
        return "Changes requested";
      case "expired":
        return "Expired";
      default:
        return null;
    }
  };

  const proposalStatusTone =
    embed.type === "proposal" && liveStatus === "accepted"
      ? "rounded-full border border-trust/30 bg-trust/10 px-2.5 py-0.5 text-[11px] text-trust-light"
      : embed.type === "proposal" &&
          (liveStatus === "pending" ||
            liveStatus === "countered" ||
            liveStatus === "counter_back")
        ? "rounded-full border border-ember/40 bg-ember/10 px-2.5 py-0.5 text-[11px] text-ember-light"
        : "rounded-full border border-line bg-overlay px-2.5 py-0.5 text-[11px] text-muted";

  return (
    <div className="mt-4 flex justify-center">
      <div className="w-full max-w-xl rounded-2xl border border-ember/30 bg-panel p-4 text-left">
        <p className="text-[10px] uppercase tracking-[0.18em] text-copper">
          {embed.type === "agreement"
            ? "Contract"
            : embed.type === "proposal"
              ? "Proposal"
              : "Project action"}
        </p>
        <p
          className={
            embed.type === "proposal"
              ? "mt-1 font-serif text-lg text-foreground"
              : "mt-1 font-medium text-foreground"
          }
        >
          {title}
        </p>

        {/* The priced offer itself: total, timeline, state, scope — everything the
            founder needs to decide without opening the panel. Old cards predate the
            snapshot and fall back to the message text below. */}
        {embed.type === "proposal" ? (
          <div className="mt-1">
            {typeof embed.totalAmount === "number" ? (
              <p className="mt-1 text-lg tabular-nums text-foreground">
                {embed.currency || "EUR"}{" "}
                {embed.totalAmount.toLocaleString("en-US")}
                {(embed.weeksMin ?? embed.weeksMax) != null ? (
                  <span className="ml-2 align-middle text-xs font-normal text-muted">
                    {embed.weeksMin ?? "?"}–{embed.weeksMax ?? "?"} weeks
                  </span>
                ) : null}
              </p>
            ) : null}
            {proposalStatusLabel(liveStatus) ? (
              <div className="mt-2">
                <span className={proposalStatusTone}>
                  {proposalStatusLabel(liveStatus)}
                </span>
              </div>
            ) : null}
            {(embed.counterRound === 1 || embed.counterRound === 2) &&
            typeof embed.counterTotalAmount === "number" ? (
              <div className="mt-2 rounded-lg border border-ember/25 bg-background px-3 py-2">
                <p className="text-[11px] text-ember-light">
                  {embed.counterRound === 1 ? "Counter" : "Final counter"}
                  {" · "}
                  {embed.currency || "EUR"}{" "}
                  {embed.counterTotalAmount.toLocaleString("en-US")}
                  {(embed.counterWeeksMin ?? embed.counterWeeksMax) != null
                    ? ` · ${embed.counterWeeksMin ?? "?"}–${embed.counterWeeksMax ?? "?"} weeks`
                    : ""}
                </p>
                {embed.counterNote ? (
                  <p className="mt-1 text-[11px] text-muted">
                    {embed.counterNote}
                  </p>
                ) : null}
              </div>
            ) : null}
            {embed.scope ? (
              <div className="mt-2 max-h-28 overflow-y-auto whitespace-pre-wrap rounded-xl border border-line bg-background p-3 text-xs leading-relaxed text-muted">
                {embed.scope}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Brief receipt: how shaped the handoff was, and the honest waiting state. */}
        {embed.type === "review_request" && typeof embed.percent === "number" ? (
          <div className="mt-2">
            <div className="flex items-center justify-between text-[11px] text-muted">
              <span>{embed.complete ? "Brief complete" : "Brief shaped"}</span>
              <span>{embed.percent}%</span>
            </div>
            <div
              className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-overlay"
              role="progressbar"
              aria-valuenow={embed.percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Brief completeness"
            >
              <div
                className="h-1.5 rounded-full bg-ember"
                style={{ width: `${Math.min(100, Math.max(0, embed.percent))}%` }}
              />
            </div>
          </div>
        ) : null}

        {/* The contract itself: total, both signatures, and the exact text being signed. */}
        {embed.type === "agreement" && ownContract ? (
          <div className="mt-2">
            {typeof ownContract.total_amount === "number" ? (
              <p className="text-xs text-foreground">
                {ownContract.currency || "EUR"}{" "}
                {ownContract.total_amount.toLocaleString("en-US")}
              </p>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-2">
              {signatureBadge(founderSigned, "Founder")}
              {signatureBadge(teamSigned, "Team")}
            </div>
            <div className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-xl border border-line bg-background p-3 text-xs leading-relaxed text-muted">
              {ownContract.terms}
            </div>
          </div>
        ) : null}

        <p className="mt-2 text-xs text-muted">{message.content}</p>

        {showsFundingForm(embed, canDecide) ? (
          <FundingForm
            messageId={message.id}
            disabled={embedBusy}
            onSubmit={(txHash) =>
              onEmbedAction?.(embed, "submit_funding", txHash)
            }
          />
        ) : null}

        {/* Inline contract revision: both sides may edit; saving clears both signatures. */}
        {embed.type === "agreement" && editing ? (
          <div className="mt-3">
            <label className="sr-only" htmlFor={`terms-${message.id}`}>
              Contract terms
            </label>
            <textarea
              id={`terms-${message.id}`}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              rows={6}
              maxLength={8000}
              className="w-full rounded-xl border border-line bg-background p-3 text-xs leading-relaxed text-foreground focus:border-ember focus:outline-none"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={
                  embedBusy ||
                  !draft.trim() ||
                  draft.trim() === (ownContract?.terms ?? "").trim()
                }
                onClick={() => {
                  onEmbedAction?.(embed, "edit_contract", draft.trim());
                  setEditing(false);
                }}
                className="rounded-lg bg-ember px-3 py-1.5 text-xs font-semibold text-background disabled:opacity-60"
              >
                Save contract
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-lg border border-line px-3 py-1.5 text-xs text-foreground"
              >
                Cancel
              </button>
            </div>
            <p className="mt-1.5 text-[10px] leading-relaxed text-muted">
              Saving replaces the contract text and clears both signatures — each side
              accepts the new version.
            </p>
          </div>
        ) : null}

        {/* Counter round: price and timeline are edited on the card itself. */}
        {embed.type === "proposal" && countering ? (
          <div className="mt-3 rounded-xl border border-ember/30 bg-background p-3">
            <p className="text-[11px] font-semibold text-ember-light">
              {countering === "counter" ? "Counter offer" : "Counter back"}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <label className="sr-only" htmlFor={`counter-amount-${message.id}`}>
                Total amount in EUR
              </label>
              <input
                id={`counter-amount-${message.id}`}
                value={counterAmount}
                onChange={(event) => setCounterAmount(event.target.value)}
                inputMode="numeric"
                placeholder="Total (EUR)"
                disabled={embedBusy}
                className="w-28 rounded-lg border border-line bg-panel px-3 py-1.5 text-xs text-foreground placeholder:text-muted focus:border-ember focus:outline-none disabled:opacity-60"
              />
              <label className="sr-only" htmlFor={`counter-weeks-${message.id}`}>
                Timeline in weeks
              </label>
              <input
                id={`counter-weeks-${message.id}`}
                value={counterWeeks}
                onChange={(event) => setCounterWeeks(event.target.value)}
                inputMode="numeric"
                placeholder="Weeks"
                disabled={embedBusy}
                className="w-24 rounded-lg border border-line bg-panel px-3 py-1.5 text-xs text-foreground placeholder:text-muted focus:border-ember focus:outline-none disabled:opacity-60"
              />
              <label className="sr-only" htmlFor={`counter-note-${message.id}`}>
                Note
              </label>
              <input
                id={`counter-note-${message.id}`}
                value={counterNote}
                onChange={(event) => setCounterNote(event.target.value)}
                placeholder="Note (optional)"
                maxLength={1000}
                disabled={embedBusy}
                className="min-w-0 flex-1 rounded-lg border border-line bg-panel px-3 py-1.5 text-xs text-foreground placeholder:text-muted focus:border-ember focus:outline-none disabled:opacity-60"
              />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={embedBusy || !counterValid}
                onClick={() => {
                  onEmbedAction?.(
                    embed,
                    countering,
                    JSON.stringify({
                      totalAmount: counterAmountValue,
                      weeksMin: counterWeeksValue,
                      weeksMax: counterWeeksValue,
                      note: counterNote.trim() || null,
                    }),
                  );
                  setCountering(null);
                }}
                className="rounded-lg bg-ember px-3 py-1.5 text-xs font-semibold text-background disabled:opacity-60"
              >
                {countering === "counter" ? "Send counter offer" : "Send counter back"}
              </button>
              <button
                type="button"
                onClick={() => setCountering(null)}
                className="rounded-lg border border-line px-3 py-1.5 text-xs text-foreground"
              >
                Cancel
              </button>
            </div>
            <p className="mt-1.5 text-[10px] leading-relaxed text-muted">
              {countering === "counter"
                ? "The specialist can accept this or counter back once. After that you make the final call."
                : "This is your last offer. The founder can only accept or decline it."}
            </p>
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-2">
          {/* Which controls appear is decided by the tested embed-actions module. */}
          {actions.map((item) =>
            item.action === "details" ? (
              <button
                key={item.action}
                type="button"
                onClick={() => onEmbedAction?.(embed, "details")}
                className="rounded-lg border border-line px-3 py-1.5 text-xs text-foreground"
              >
                {item.label}
              </button>
            ) : item.action === "edit_contract" ? (
              <button
                key={item.action}
                type="button"
                disabled={embedBusy}
                onClick={() => {
                  setDraft(ownContract?.terms ?? "");
                  setEditing(true);
                }}
                className="rounded-lg border border-ember/40 px-3 py-1.5 text-xs font-semibold text-ember-light disabled:opacity-60"
              >
                {item.label}
              </button>
            ) : item.action === "counter" || item.action === "counter_back" ? (
              <button
                key={item.action}
                type="button"
                disabled={embedBusy}
                onClick={() => {
                  const chosen = item.action === "counter" ? "counter" : "counter_back";
                  setCounterAmount("");
                  setCounterWeeks("");
                  setCounterNote("");
                  setCountering(chosen);
                }}
                className="rounded-lg border border-ember/40 px-3 py-1.5 text-xs font-semibold text-ember-light disabled:opacity-60"
              >
                {item.label}
              </button>
            ) : (
              <button
                key={item.action}
                type="button"
                disabled={embedBusy}
                onClick={() => onEmbedAction?.(embed, item.action)}
                className="rounded-lg bg-ember px-3 py-1.5 text-xs font-semibold text-background disabled:opacity-60"
              >
                {item.label}
              </button>
            ),
          )}
        </div>
      </div>
    </div>
  );
}

// Example starters for a first-timer. These deliberately read like a real, well-formed first
// message rather than a bare category ("Build a website"), because a newcomer needs to see the
// shape of a good opening before writing one. Tapping a chip sends it verbatim as the first message.
export const SUGGESTED_PROMPTS = [
  "I run a small bakery and I want a website that takes online orders and shows our daily specials. I have photos and a logo already, and I need it live before the end of next month.",
  "We keep missing support tickets because they arrive by email. I want a simple internal tool where my team can log a ticket, assign it, and see what is still open.",
  "I want to launch a small SaaS that turns customer feedback into a prioritised roadmap. I have a prototype in a spreadsheet, but I do not know the right stack or what to build first.",
];

// Two-letter initials come from lib/identity-display.js so the rail, header and
// transcript all derive the same deterministic fallback avatar for the same person.

// Profile cards load once per person per session and are shared by every message
// avatar, so a long conversation never refetches the same identity.
type ProfileCard = {
  displayId: number | null;
  username: string | null;
  displayName: string | null;
  role: string | null;
  avatarUrl: string | null;
};

const profileCache = new Map<string, Promise<ProfileCard | null>>();

function loadProfileCard(
  conversationId: string,
  userId: string,
): Promise<ProfileCard | null> {
  const key = `${conversationId}:${userId}`;
  let pending = profileCache.get(key);
  if (!pending) {
    pending = fetch(
      `/api/profile-card?conversationId=${encodeURIComponent(conversationId)}&userId=${encodeURIComponent(userId)}`,
    )
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => (data?.identity ? (data.identity as ProfileCard) : null))
      .catch(() => null);
    profileCache.set(key, pending);
  }
  return pending;
}

function Avatar({
  label,
  author,
  userId,
  conversationId,
}: {
  label: string;
  author?: string;
  userId?: string | null;
  conversationId?: string;
}) {
  const [profile, setProfile] = useState<ProfileCard | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  // The avatar is the trigger and the only thing a keyboard user can reach, so focus returns to it
  // on dismissal. Without this, Escape would strand focus on <body> and lose the user's place.
  const triggerRef = useRef<HTMLDivElement | null>(null);
  // Deterministic muted tone: the same person keeps the same fallback avatar across sessions.
  const tone = avatarTone(userId ?? author ?? label);

  // Real profile image when the member has one; initials otherwise. Loaded once per
  // person per session through the shared cache, so hover never refetches.
  useEffect(() => {
    if (!userId || !conversationId) return;
    let cancelled = false;
    void loadProfileCard(conversationId, userId).then((data) => {
      if (!cancelled) setProfile(data);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, conversationId]);

  function openProfile() {
    setShowProfile(true);
  }
  function closeProfile() {
    setShowProfile(false);
    triggerRef.current?.focus();
  }

  const displayName = profile?.displayName || author || "";
  const showImage = Boolean(userId && profile?.avatarUrl && !imageFailed);

  return (
    <div
      className="relative"
      onMouseEnter={() => void openProfile()}
      onMouseLeave={() => setShowProfile(false)}
      onFocus={() => void openProfile()}
      // Escape dismisses and returns focus. onKeyDown on the wrapper catches it while focus is on
      // the trigger or the card, so the card is not a focus trap with no way out.
      onKeyDown={(event) => {
        if (event.key === "Escape" && showProfile) {
          event.stopPropagation();
          closeProfile();
        }
      }}
    >
      <div
        ref={triggerRef}
        style={showImage ? undefined : tone}
        className="bf-avatar flex h-8 w-8 shrink-0 cursor-help items-center justify-center overflow-hidden rounded-full text-xs font-semibold"
        tabIndex={userId ? 0 : undefined}
        role={userId ? "button" : undefined}
        aria-expanded={userId ? showProfile : undefined}
        aria-label={author ? `${author} — view profile` : undefined}
        aria-hidden={author ? undefined : true}
      >
        {showImage ? (
          /* eslint-disable-next-line @next/next/no-img-element -- avatars come from arbitrary
             third-party hosts (Google OAuth and Supabase Storage), so next/image remotePatterns
             cannot be pinned safely. Sizes are small and CSS-cropped by .bf-avatar-img. */
          <img
            src={profile?.avatarUrl ?? ""}
            alt={avatarLabel(displayName)}
            className="bf-avatar-img"
            loading="lazy"
            decoding="async"
            onError={() => setImageFailed(true)}
          />
        ) : (
          label
        )}
        {author ? <span className="sr-only">{author}</span> : null}
      </div>
      {showProfile && userId ? (
        <div
          role="dialog"
          aria-label={`${author || "Profile"} details`}
          className="bf-profile-card fixed top-0 left-1/2 -translate-x-1/2 max-w-sm rounded-xl border border-line bg-deep p-3 text-left shadow-2xl"
        >
          {profile ? (
            <>
              <div className="flex items-center gap-2.5">
                {profile.avatarUrl && !imageFailed ? (
                  /* eslint-disable-next-line @next/next/no-img-element -- same as the avatar
                     button above: third-party avatar hosts cannot be pinned in remotePatterns. */
                  <img
                    src={profile.avatarUrl}
                    alt={avatarLabel(displayName)}
                    className="bf-avatar-img h-9 w-9 rounded-full"
                    loading="lazy"
                    decoding="async"
                    onError={() => setImageFailed(true)}
                  />
                ) : (
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                    style={avatarTone(userId)}
                    aria-hidden="true"
                  >
                    {initialsFor(displayName)}
                  </span>
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">
                    {displayName || "Member"}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {profile.username
                      ? `@${profile.username}`
                      : profile.displayId
                        ? `#${profile.displayId}`
                        : ""}
                  </p>
                </div>
              </div>
              {profile.role ? (
                <p className="mt-2 text-[10px] uppercase tracking-[0.15em] text-copper">
                  {profile.role}
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-xs text-muted">Loading profile…</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

// BrandForge AI is software, not a person: it gets the BrandForge mark, never a
// human-looking avatar, robot head or cartoon face.
function BrandForgeMark() {
  return (
    <div
      className="bf-ai-mark flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-[10px]"
      aria-hidden="true"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- bundled local asset at a fixed size */}
      <img src="/discord-server-icon.png" alt="" className="h-full w-full object-cover" />
    </div>
  );
}

// Live progress while the AI works: real steps (from activity events) tick off one by one,
// the current one spins. Nothing is pre-announced that has not actually run.
function LiveProgress({ steps, request }: { steps: string[]; request: string }) {
  const kind = detectDeliverable(request);
  const label = KINDS.find((entry) => entry.kind === kind)?.label;
  return (
    <div className="bf-progress" role="status" aria-live="polite">
      <p className="bf-progress-title">{label ? `Drafting ${label}` : "Working on it"}</p>
      <ul>
        {steps.map((step, index) => (
          <li key={`${step}-${index}`} className="bf-progress-done">
            <svg viewBox="0 0 16 16" className="h-4 w-4 shrink-0" aria-hidden="true">
              <circle cx="8" cy="8" r="7" fill="none" stroke="var(--trust)" strokeWidth="1.5" />
              <path d="M4.8 8.2l2.2 2.2 4.2-4.4" fill="none" stroke="var(--trust)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {step}
          </li>
        ))}
        <li className="bf-progress-now">
          <span className="bf-spinner" aria-hidden="true" />
          Writing it up…
        </li>
      </ul>
      <p className="bf-progress-note">Usually about 20 seconds.</p>
    </div>
  );
}

// Collapsed-by-default activity summary. Only user-safe results of steps that actually
// ran this turn — never chain-of-thought, system prompts or tool arguments.
function Thoughts({ steps }: { steps: string[] }) {
  if (steps.length === 0) return null;
  return (
    <details className="bf-thoughts">
      <summary>
        Thoughts · {steps.length} step{steps.length === 1 ? "" : "s"}
      </summary>
      <ul>
        {steps.map((step, index) => (
          <li key={`${step}-${index}`}>
            <span aria-hidden="true">✓</span> {step}
          </li>
        ))}
      </ul>
    </details>
  );
}

const REACTION_EMOJI = ["👍", "❤️", "🎉", "👀"] as const;

function MessageActions({
  message,
  canManage,
  onEdit,
  onDelete,
  onReact,
  onReply,
}: {
  message: ChatMessage;
  canManage: boolean;
  onEdit: (content: string) => Promise<void>;
  onDelete: () => Promise<void>;
  onReact: (emoji: string) => Promise<void>;
  onReply?: (messageId: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.content);
  const [busy, setBusy] = useState(false);
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  function handleCopy() {
    void navigator.clipboard.writeText(message.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function handlePointerDown(e: React.PointerEvent) {
    if (e.pointerType === 'mouse') return;
    longPressTimerRef.current = setTimeout(() => {
      setVisible(true);
    }, 500);
  }

  function handlePointerUp() {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }

  return (
    <div
      className="mt-1 flex flex-wrap items-center gap-1.5"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setVisible(false);
      }}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
    >
      {visible ? (
        <>
          {REACTION_EMOJI.map((emoji) => {
            const reaction = message.reactions?.find(
              (entry) => entry.emoji === emoji,
            );
            if (!reaction) return null;
            return (
              <button
                key={emoji}
                type="button"
                disabled={busy}
                aria-pressed={reaction.reactedByMe}
                aria-label={`${emoji}, ${reaction.count} reactions${reaction.reactedByMe ? ', reacted by you' : ''}`}
                onClick={() => void run(() => onReact(emoji))}
                className={`rounded-full border px-2 py-0.5 text-xs ${
                  reaction.reactedByMe
                    ? "border-ember/70 bg-ember/15 text-focus"
                    : "border-line hover:border-ember"
                }`}
              >
                {emoji} {reaction.count}
              </button>
            );
          })}
          {REACTION_EMOJI.filter(
            (emoji) =>
              !message.reactions?.some((entry) => entry.emoji === emoji),
          ).map((emoji) => (
            <button
              key={`add-${emoji}`}
              type="button"
              disabled={busy}
              aria-label={`React with ${emoji}`}
              onClick={() => void run(() => onReact(emoji))}
              className="rounded px-1.5 py-0.5 text-xs text-muted hover:bg-overlay"
            >
              +{emoji}
            </button>
          ))}
          {onReply ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => onReply(message.id)}
              className="rounded px-1.5 py-0.5 text-xs text-muted hover:bg-overlay"
            >
              ↩ Reply
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy}
            onClick={handleCopy}
            className="rounded px-1.5 py-0.5 text-xs text-muted hover:bg-overlay"
          >
            {copied ? '✓ Copied' : <><span aria-hidden="true">📋</span> Copy</>}
          </button>
          {canManage ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => setEditing((value) => !value)}
                className="rounded px-1.5 py-0.5 text-xs text-muted hover:bg-overlay"
              >
                Edit
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void run(onDelete)}
                className="rounded px-1.5 py-0.5 text-xs text-muted hover:bg-overlay"
              >
                Delete
              </button>
            </>
          ) : null}
        </>
      ) : (
        <>
          {REACTION_EMOJI.map((emoji) => {
            const reaction = message.reactions?.find(
              (entry) => entry.emoji === emoji,
            );
            if (!reaction) return null;
            return (
              <button
                key={emoji}
                type="button"
                disabled={busy}
                aria-pressed={reaction.reactedByMe}
                aria-label={`${emoji}, ${reaction.count} reactions${reaction.reactedByMe ? ', reacted by you' : ''}`}
                onClick={() => void run(() => onReact(emoji))}
                className={`rounded-full border px-2 py-0.5 text-xs ${
                  reaction.reactedByMe
                    ? "border-ember/70 bg-ember/15 text-focus"
                    : "border-line hover:border-ember"
                }`}
              >
                {emoji} {reaction.count}
              </button>
            );
          })}
        </>
      )}
      {editing ? (
        <div className="mt-1 flex w-full gap-2">
          <input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            maxLength={8000}
            className="min-w-0 flex-1 rounded-lg border border-line bg-background px-2 py-1.5 text-sm text-foreground"
          />
          <button
            type="button"
            disabled={busy || !draft.trim()}
            onClick={() =>
              void run(async () => {
                await onEdit(draft);
                setEditing(false);
              })
            }
            className="rounded-lg bg-ember px-3 py-1.5 text-xs font-semibold text-background"
          >
            Save
          </button>
        </div>
      ) : null}
    </div>
  );
}

// First-run orientation for a brand-new chat. This is static product copy, not an AI reply and
// not a message row: nothing here is persisted, nothing is attributed to a person, and it never
// enters the AI suggestion/approval queue. A new project starts in DISCOVERY, so the rail opens on
// "Describe" and every later stage is visibly still ahead of the founder.
const PROJECT_STAGES = [
  { key: "describe", label: "Describe", hint: "Tell us what you want built" },
  {
    key: "proposal",
    label: "Proposal",
    hint: "A specialist reviews and prices it",
  },
  { key: "fund", label: "Fund", hint: "You approve, then fund into escrow" },
  {
    key: "deliver",
    label: "Deliver",
    hint: "Work is built and milestone-released",
  },
] as const;

function FirstRunRail() {
  return (
    <ol
      className="mt-6 grid w-full max-w-xl grid-cols-2 gap-2 sm:grid-cols-4"
      aria-label="How a BrandForge project progresses"
    >
      {PROJECT_STAGES.map((stage, index) => (
        <li
          key={stage.key}
          className="rounded-xl border border-line bg-panel p-3 text-left"
        >
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold ${
                index === 0
                  ? "bg-ember text-background"
                  : "border border-line text-muted"
              }`}
            >
              {index + 1}
            </span>
            <span
              className={`text-xs font-semibold ${index === 0 ? "text-foreground" : "text-muted"}`}
            >
              {stage.label}
            </span>
            {index === 0 ? (
              <span className="sr-only">(current stage)</span>
            ) : null}
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
            {stage.hint}
          </p>
        </li>
      ))}
    </ol>
  );
}

export function ChatTranscript({
  messages,
  isStreaming,
  isTyping,
  typingNames,
  onSuggestion,
  currentUserId,
  onEditMessage,
  onDeleteMessage,
  onReact,
  onReply,
  conversationId,
  onEmbedAction,
  embedBusy,
  canDecide,
  agreement,
  proposal,
  isStaff,
  onAskFile,
  selfRole,
  participantRoles,
}: {
  messages: ChatMessage[];
  isStreaming: boolean;
  isTyping: boolean;
  typingNames: string[];
  onSuggestion: (prompt: string) => void;
  currentUserId: string | null;
  onEditMessage: (id: string, content: string) => Promise<void>;
  onDeleteMessage: (id: string) => Promise<void>;
  onReact: (id: string, emoji: string) => Promise<void>;
  onReply?: (messageId: string) => void;
  conversationId: string;
  onEmbedAction?: (
    embed: ChatEmbed,
    action: ChatEmbedAction,
    value?: string,
  ) => void;
  embedBusy?: boolean;
  /**
   * Only the founder who owns the project may accept a proposal or submit funding. Staff reading
   * someone else's chat see the same card as read-only context instead of a button that the
   * server will reject with 403. The contract card is the exception: BOTH sides sign, so it also
   * receives `isStaff` and the live `agreement` row (signature columns) to decide per side.
   */
  canDecide?: boolean;
  /** Live contract row for signature state on agreement cards; null before one exists. */
  agreement?: ContractSummary | null;
  /** Live proposal row: proposal cards follow it instead of their frozen snapshot. */
  proposal?: { id: string; status: string } | null;
  /** Whether the viewer is BrandForge staff (the "team" side of the contract signature). */
  isStaff?: boolean;
  /** Prefills the composer with an "ask about this file" prompt for a readable attachment. */
  onAskFile?: (fileName: string) => void;
  /** The signed-in member's honest role label ("Founder", "BrandForge staff"), when known. */
  selfRole?: string | null;
  /** Lowercased display name -> role, built from the real participant roster. */
  participantRoles?: Record<string, string>;
}) {
  if (messages.length === 0) {
    return (
      <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col items-center justify-center text-center">
        <h1 className="font-serif text-3xl text-foreground sm:text-4xl">
          What are you building?
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted">
          Tell me what you want built — a few sentences is enough. I will turn it
          into requirements you can correct as we talk, and a specialist then
          sends a priced proposal. Nothing is charged until you approve it.
        </p>

        <FirstRunRail />

        <div className="mt-6 flex w-full max-w-2xl flex-col gap-2">
          <p className="text-[10px] uppercase tracking-[0.18em] text-muted">
            Or start from an example
          </p>
          <div className="flex flex-col gap-2">
            {SUGGESTED_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => onSuggestion(prompt)}
                className="rounded-xl border border-line bg-panel px-4 py-2.5 text-left text-sm leading-snug text-foreground transition hover:border-ember"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="mx-auto w-full max-w-3xl"
      role="log"
      aria-label="Conversation messages"
      aria-relevant="additions text"
    >
      {messages.map((message, index) => {
        if (message.sender === "system") {
          if (message.embed) {
            return (
              <SystemEmbedCard
                key={message.id}
                message={message}
                canDecide={canDecide}
                isStaff={isStaff}
                canEdit={canDecide}
                contract={agreement ?? null}
                proposal={proposal ?? null}
                embedBusy={embedBusy}
                onEmbedAction={onEmbedAction}
              />
            );
          }
          return (
            <div key={message.id} className="mt-4 flex justify-center">
              <p className="rounded-full border border-trust/30 bg-trust/10 px-4 py-2 text-center text-xs leading-relaxed text-trust-light">
                {message.content}
              </p>
            </div>
          );
        }

        const isUser = message.sender === "user";
        const isHuman = message.sender === "human";
        const isAI = message.sender === "ai";
        const artifact = message.artifactData;

        // Pillar A: a human message is always a named person. Older rows stored before
        // sender_name existed fall back to a neutral word rather than inventing a team identity.
        const authorName = isAI
          ? "BrandForge AI"
          : message.senderName?.trim() || (isHuman ? "BrandForge" : "You");
        const authorInitials = initialsFor(authorName);

        // Grouped-message behavior: avatar and name appear on the first message of a run,
        // follow-ups tuck underneath with a compact gap. System pills and embeds break groups.
        const previous = messages[index - 1];
        const grouped = Boolean(
          previous &&
          previous.sender !== "system" &&
          previous.sender === message.sender &&
          (message.sender !== "human" ||
            (previous.senderName ?? "") === (message.senderName ?? "")),
        );

        const roleLabel = isAI
          ? "Execution Assistant"
          : isUser
            ? selfRole || null
            : participantRoles?.[authorName.trim().toLowerCase()] || null;

        return (
          <div
            key={message.id}
            className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"} ${grouped ? "mt-1.5" : "mt-5"}`}
          >
            {!isUser ? (
              grouped ? (
                <div className="w-8 shrink-0" aria-hidden="true" />
              ) : isAI ? (
                <BrandForgeMark />
              ) : (
                <Avatar
                  label={authorInitials}
                  author={authorName}
                  userId={message.senderId}
                  conversationId={conversationId}
                />
              )
            ) : null}

            <div
              className={`min-w-0 max-w-2xl ${isUser ? "order-first flex flex-col items-end" : ""}`}
            >
              {!grouped && !isAI ? (
                <p className="mb-1 flex items-baseline gap-2">
                  <span className="text-[13px] font-semibold text-foreground">
                    {authorName}
                  </span>
                  {roleLabel ? (
                    <span className="text-[10px] uppercase tracking-[0.14em] text-muted">
                      {roleLabel}
                    </span>
                  ) : null}
                </p>
              ) : null}
              <div
                className={
                  isAI
                    ? "bf-ai-content"
                    : `whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-[15px] leading-relaxed border border-line text-foreground ${
                        isUser ? "bg-panel-2" : "bg-panel"
                      }`
                }
              >
                {artifact?.generated ? (
                  <figure className="mb-1">
                    {/* eslint-disable-next-line @next/next/no-img-element -- authenticated runtime path */}
                    <img
                      src={`/api/attachments?path=${encodeURIComponent(artifact.path)}`}
                      alt={message.content || "AI-generated image"}
                      className="max-h-96 max-w-full rounded-xl border border-line object-contain"
                      loading="lazy"
                      decoding="async"
                    />
                    <figcaption className="mt-1.5 flex items-center gap-2 text-xs text-muted">
                      <span>AI-generated</span>
                      <a
                        href={`/api/attachments?path=${encodeURIComponent(artifact.path)}`}
                        download={artifact.name}
                        className="text-ember underline-offset-2 hover:underline"
                      >
                        Download
                      </a>
                    </figcaption>
                  </figure>
                ) : artifact ? (
                  <div className="mb-2">
                    {artifact.contentType?.startsWith("audio/") ? (
                      <audio
                        controls
                        preload="none"
                        className="mb-2 w-full max-w-sm"
                        aria-label={`Audio attachment ${artifact.name}`}
                      >
                        <source
                          src={`/api/attachments?path=${encodeURIComponent(artifact.path)}`}
                          type={artifact.contentType}
                        />
                      </audio>
                    ) : null}
                    {artifact.contentType?.startsWith("image/") ? (
                      // Attachments stream from the authenticated /api/attachments route with a
                      // runtime path, so next/image optimization would drop the session check.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`/api/attachments?path=${encodeURIComponent(artifact.path)}`}
                        alt={artifact.name}
                        className="mb-2 max-h-64 max-w-full rounded-xl border border-line object-contain"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : null}
                    <a
                      href={`/api/attachments?path=${encodeURIComponent(artifact.path)}`}
                      className="flex items-center gap-2 rounded-xl border border-ember/30 bg-background/50 px-3 py-2 text-xs text-foreground hover:border-ember"
                    >
                      <span aria-hidden="true">↗</span>
                      <span className="min-w-0 flex-1 truncate">
                        {artifact.name}
                      </span>
                      <span className="text-[10px] text-muted">
                        {Math.ceil(artifact.size / 1024)} KB
                      </span>
                    </a>
                    {/* Only genuinely readable files get an "ask" shortcut - never imply the AI
                        can open a PDF or image it has no parser for. */}
                    {onAskFile && isDirectlyReadable(artifact.contentType) ? (
                      <button
                        type="button"
                        onClick={() => onAskFile(artifact.name)}
                        className="mt-2 text-xs font-semibold text-copper transition hover:text-foreground"
                      >
                        Ask BrandForge about this file
                      </button>
                    ) : null}
                  </div>
                ) : null}
                {isAI ? (
                  <RichContent content={message.content} streaming={Boolean(message.streaming)} />
                ) : (
                  message.content
                )}
                {message.editedAt ? (
                  <span
                    className={
                      isUser
                        ? "ml-2 text-[10px] opacity-60"
                        : "ml-2 text-[10px] text-muted"
                    }
                  >
                    edited
                  </span>
                ) : null}
                {message.streaming && !message.content ? (
                  <LiveProgress
                    steps={message.thoughts ?? []}
                    request={
                      [...messages.slice(0, index)].reverse().find((entry) => entry.sender === "user")?.content ?? ""
                    }
                  />
                ) : null}
              </div>
              {isAI && message.thoughts && message.thoughts.length > 0 ? (
                <Thoughts steps={message.thoughts} />
              ) : null}
              <MessageActions
                message={message}
                canManage={Boolean(
                  currentUserId && message.senderId === currentUserId,
                )}
                onEdit={(content) => onEditMessage(message.id, content)}
                onDelete={() => onDeleteMessage(message.id)}
                onReact={(emoji) => onReact(message.id, emoji)}
                onReply={onReply}
              />
            </div>

            {isUser ? (
              grouped ? (
                <div className="w-8 shrink-0" aria-hidden="true" />
              ) : (
                <Avatar
                  label={authorInitials}
                  author={authorName}
                  userId={message.senderId}
                  conversationId={conversationId}
                />
              )
            ) : null}
          </div>
        );
      })}

      {!isStreaming && isTyping && typingNames.length > 0 ? (
        <div className="mt-5 flex gap-3">
          <BrandForgeMark />
          <p className="bf-streaming-state" role="status">
            <span className="bf-streaming-dot" aria-hidden="true" />
            {typingNames.length === 1
              ? `${typingNames[0]} is typing…`
              : `${typingNames.length} people are typing…`}
          </p>
        </div>
      ) : null}
      {isStreaming && !messages.some((message) => message.streaming) ? (
        <div className="mt-5 flex gap-3">
          <BrandForgeMark />
          <p className="bf-streaming-state" role="status">
            <span className="bf-streaming-dot" aria-hidden="true" />
            Working…
          </p>
        </div>
      ) : null}
    </div>
  );
}
