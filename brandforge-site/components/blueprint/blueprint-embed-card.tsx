"use client";

import { useState } from "react";

interface Props {
  embed?: { title?: string; body?: string };
  canEdit?: boolean;
  blueprintId: string;
  emailed?: boolean;
  document?: any;
}

export const BlueprintEmbedCard = ({ embed, canEdit, blueprintId, emailed, document }: Props) => {
  const [localEmail, setLocalEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [saved, setSaved] = useState(!!emailed);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!localEmail.trim()) return;
    setSending(true);
    try {
      const response = await fetch("/api/blueprint/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blueprintId,
          email: localEmail.trim(),
          gate: "before_price",
        }),
      });
      const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok) {
        alert((data.error as string) || "Could not save the blueprint.");
      } else {
        setSaved(true);
      }
    } catch {
      alert("Could not reach the server. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="blueprint-embed-card">
      {/* Show blueprint info */}
      <div className="blueprint-info">
        <h3>{embed?.title || "No title"}</h3>
        <p>{embed?.body?.slice(0, 100) || "No content"}</p>
      </div>

      {saved ? (
        <span className="badge bg-success">Sent</span>
      ) : canEdit ? (
        <form onSubmit={save}>
          <input
            aria-label="Email address for your return link"
            type="email"
            value={localEmail}
            onChange={(event) => setLocalEmail(event.target.value)}
            placeholder="Your email"
            className="btn btn-secondary btn-sm"
          />
          <button
            type="submit"
            disabled={sending}
            className="btn btn-secondary btn-sm"
          >
            {sending ? "Saving…" : "Save"}
          </button>
        </form>
      ) : null}

      {/* Document preview (if available) */}
      {document && (
        <div className="blueprint-doc-preview">
          {document.slice(0, 200) || "No document"}
        </div>
      )}
    </div>
  );
};

export default BlueprintEmbedCard;
