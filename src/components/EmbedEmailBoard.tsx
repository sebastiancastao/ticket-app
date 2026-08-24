"use client";

import { useCallback, useEffect, useState } from "react";
import type { MissiveEmail } from "@/lib/missive";

type LoadState = "loading" | "ready" | "error";

function formatEmailDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// View-only counterpart to EmailExtractionBoard, for cross-domain iframe
// embedding: authenticates via the ?token= bearer token instead of the
// session cookie (which third-party iframes can't rely on), and has no
// Submit to Xcelerator action — this token can only ever read.
export function EmbedEmailBoard({ token }: { token: string }) {
  const [emails, setEmails] = useState<MissiveEmail[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [selectedId, setSelectedId] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const loadEmails = useCallback(async () => {
    if (!token) {
      setState("error");
      return;
    }
    try {
      const response = await fetch(`/api/missive/emails?token=${encodeURIComponent(token)}`);
      if (!response.ok) throw new Error(`status ${response.status}`);
      const data = (await response.json()) as { emails: MissiveEmail[] };
      setEmails(data.emails);
      // Keep the current selection if it's still present after a refresh,
      // instead of always snapping back to the first email.
      setSelectedId((prev) =>
        prev && data.emails.some((email) => email.id === prev) ? prev : (data.emails[0]?.id ?? "")
      );
      setState("ready");
    } catch {
      setState("error");
    }
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    async function initialLoad() {
      if (!cancelled) await loadEmails();
    }
    initialLoad();
    return () => {
      cancelled = true;
    };
  }, [loadEmails]);

  async function handleRefresh() {
    setRefreshing(true);
    await loadEmails();
    setRefreshing(false);
  }

  const selectedEmail = emails.find((email) => email.id === selectedId);

  if (state === "error") {
    return (
      <p className="text-sm text-red-600 dark:text-red-400">
        This embed link is missing or no longer valid.
      </p>
    );
  }

  if (state === "loading") {
    return <p className="text-sm text-zinc-500 dark:text-zinc-400">Loading…</p>;
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="flex flex-col gap-3 rounded-xl border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-[#0a0a0a]">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Emails</p>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            className="shrink-0 rounded-full border border-black/[.08] px-3 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-black/[.03] disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[.1] dark:text-zinc-300 dark:hover:bg-white/[.05]"
          >
            {refreshing ? "Refreshing…" : "↻ Refresh"}
          </button>
        </div>
        {emails.length === 0 ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No emails in this mailbox scope yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {emails.map((email) => {
              const isSelected = email.id === selectedId;
              return (
                <li key={email.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(email.id)}
                    aria-pressed={isSelected}
                    className={`w-full rounded-lg border p-3 text-left transition-colors ${
                      isSelected
                        ? "border-zinc-950 bg-zinc-50 dark:border-zinc-50 dark:bg-[#1a1a1a]"
                        : "border-black/[.08] hover:bg-black/[.03] dark:border-white/[.1] dark:hover:bg-[#141414]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
                        {email.subject}
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        {email.ticketMapping && (
                          <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                            Ticket
                          </span>
                        )}
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">
                          {formatEmailDate(email.receivedAt)}
                        </span>
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400">{email.from}</p>
                    <p className="mt-1 line-clamp-2 whitespace-pre-line text-xs text-zinc-600 dark:text-zinc-400">
                      {email.body}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-3 rounded-xl border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-[#0a0a0a]">
        <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
          {selectedEmail?.ticketMapping
            ? `Extracted Data — ${selectedEmail.ticketMapping.label} (${Math.round(
                selectedEmail.ticketMapping.confidence * 100
              )}% match)`
            : "Extracted Data"}
        </p>
        {selectedEmail?.messageId && selectedEmail.attachments && selectedEmail.attachments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {selectedEmail.attachments.map((attachment) => (
              <a
                key={attachment.id}
                href={`/api/missive/attachment?messageId=${encodeURIComponent(
                  selectedEmail.messageId!
                )}&attachmentId=${encodeURIComponent(attachment.id)}&token=${encodeURIComponent(token)}`}
                className="inline-flex items-center gap-1.5 rounded-full border border-black/[.08] px-3 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-black/[.03] dark:border-white/[.1] dark:text-zinc-300 dark:hover:bg-[#141414]"
              >
                ↓ {attachment.filename}
              </a>
            ))}
          </div>
        )}
        {selectedEmail?.ticketMapping ? (
          <div className="flex flex-col gap-3">
            {selectedEmail.ticketMapping.fields.map((field) => (
              <div key={field.label} className="flex flex-col gap-1">
                <span className="text-xs text-zinc-500 dark:text-zinc-400">{field.label}</span>
                <p className="whitespace-pre-line text-sm text-zinc-900 dark:text-zinc-100">
                  {field.value ?? "Not found"}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {selectedEmail ? "No structured data extracted from this email." : "Select an email to see its data."}
          </p>
        )}
      </div>
    </div>
  );
}
