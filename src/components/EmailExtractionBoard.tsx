"use client";

import { useEffect, useMemo, useState } from "react";
import { MOCK_EMAILS } from "@/lib/mock-emails";
import { extractShipmentData } from "@/lib/extract-shipment-data";
import type { MissiveEmail } from "@/lib/missive";
import { AXIS_SUBMITTABLE_TYPES } from "@/lib/axis-map";
import type { TicketPriority } from "@/lib/tickets";

const PRIORITY_LABELS: Record<TicketPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

const PRIORITY_STYLES: Record<TicketPriority, string> = {
  low: "bg-zinc-100 text-zinc-700 dark:bg-zinc-500/10 dark:text-zinc-300",
  medium: "bg-blue-100 text-blue-800 dark:bg-blue-500/10 dark:text-blue-400",
  high: "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400",
};

type SubmitStatus =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "success"; orderTrackingId: string }
  | { kind: "error"; message: string };
type InboxSource = "loading" | "live" | "mock";

function formatEmailDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function EmailExtractionBoard() {
  const [emails, setEmails] = useState<MissiveEmail[]>(MOCK_EMAILS);
  const [source, setSource] = useState<InboxSource>("loading");
  const [selectedId, setSelectedId] = useState(MOCK_EMAILS[0]?.id ?? "");
  const [status, setStatus] = useState<SubmitStatus>({ kind: "idle" });

  useEffect(() => {
    let cancelled = false;

    async function loadInbox() {
      try {
        const response = await fetch("/api/missive/emails");
        if (!response.ok) throw new Error(`status ${response.status}`);
        const data = (await response.json()) as { emails: MissiveEmail[] };
        if (cancelled) return;
        // Once the query succeeds, always show its (possibly empty) result
        // instead of the mock inbox — an empty live inbox under a "mock"
        // label would be more misleading than an empty list.
        setEmails(data.emails);
        setSelectedId(data.emails[0]?.id ?? "");
        setSource("live");
      } catch {
        // Not signed in, or the Missive request failed — keep showing the
        // mock inbox instead of an error state.
        if (!cancelled) setSource("mock");
      }
    }

    loadInbox();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedEmail = emails.find((email) => email.id === selectedId);
  const extracted = useMemo(
    () => (selectedEmail ? extractShipmentData(selectedEmail) : null),
    [selectedEmail]
  );
  const downloadableAttachments =
    selectedEmail?.messageId && selectedEmail.attachments?.length
      ? { messageId: selectedEmail.messageId, attachments: selectedEmail.attachments }
      : null;

  const isSubmittableTicket =
    !!selectedEmail?.ticketMapping && AXIS_SUBMITTABLE_TYPES.has(selectedEmail.ticketMapping.type);

  function handleSelect(id: string) {
    setSelectedId(id);
    setStatus({ kind: "idle" });
  }

  async function handleSubmit() {
    if (!selectedEmail?.ticketMapping || status.kind === "submitting") return;
    setStatus({ kind: "submitting" });
    try {
      const response = await fetch("/api/axis-submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mapping: selectedEmail.ticketMapping,
          sourceEmailId: selectedEmail.id,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? `Axis submit failed (status ${response.status})`);
      }
      setStatus({ kind: "success", orderTrackingId: String(data.orderTrackingId ?? "") });
    } catch (err) {
      setStatus({ kind: "error", message: err instanceof Error ? err.message : "Failed to submit to Axis." });
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Emails &amp; Data Extraction
        </h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {source === "live"
            ? "Live inbox on the left, shipment data extracted from the selected email on the right."
            : "Mock inbox on the left, shipment data extracted from the selected email on the right."}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-3 rounded-xl border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-[#0a0a0a]">
          <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
            {source === "live"
              ? "Emails (live)"
              : source === "loading"
                ? "Emails (loading…)"
                : "Emails (mock — live inbox unavailable)"}
          </p>
          {source === "live" && emails.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              No emails in this mailbox scope yet.
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {emails.map((email) => {
                const isSelected = email.id === selectedId;
                return (
                  <li key={email.id}>
                    <button
                      type="button"
                      onClick={() => handleSelect(email.id)}
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
                      <p className="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400">
                        {email.from}
                      </p>
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
          {downloadableAttachments && (
            <div className="flex flex-wrap gap-2">
              {downloadableAttachments.attachments.map((attachment) => (
                <a
                  key={attachment.id}
                  href={`/api/missive/attachment?messageId=${encodeURIComponent(
                    downloadableAttachments.messageId
                  )}&attachmentId=${encodeURIComponent(attachment.id)}`}
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
                <ExtractedField key={field.label} label={field.label} value={field.value ?? "Not found"} />
              ))}
            </div>
          ) : extracted ? (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <ExtractedField label="Customer" value={extracted.customerName} />
                <ExtractedField label="Phone" value={extracted.contactPhone} />
              </div>
              <ExtractedField label="Email" value={extracted.contactEmail} />
              <ExtractedField label="Pickup Address" value={extracted.pickupAddress} />
              <ExtractedField label="Delivery Address" value={extracted.deliveryAddress} />
              <div className="grid grid-cols-2 gap-3">
                <ExtractedField label="Requested Date" value={extracted.requestedDate} />
                <ExtractedField label="Service Type" value={extracted.serviceType} />
              </div>
              <ExtractedField label="Shipment / Inventory" value={extracted.itemsSummary} />
              <div className="flex flex-col gap-1">
                <span className="text-xs text-zinc-500 dark:text-zinc-400">Priority</span>
                <span
                  className={`w-fit rounded-full px-2.5 py-0.5 text-xs font-medium ${PRIORITY_STYLES[extracted.priority]}`}
                >
                  {PRIORITY_LABELS[extracted.priority]}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Select an email to see the extracted data.
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!isSubmittableTicket || status.kind === "submitting"}
            className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-[#ccc]"
          >
            {status.kind === "submitting" ? "Submitting…" : "Submit to Xcelerator"}
          </button>
          {status.kind === "success" && (
            <span className="text-sm text-emerald-600 dark:text-emerald-400">
              Order created — Axis tracking ID {status.orderTrackingId} ✓
            </span>
          )}
          {status.kind === "error" && (
            <span className="text-sm text-red-600 dark:text-red-400">{status.message}</span>
          )}
        </div>
        <p className="text-xs text-zinc-400 dark:text-zinc-500">
          {isSubmittableTicket
            ? "Creates a real dispatch order in Skyline's Axis system — this is not a simulation."
            : "Only available for emails with an extracted DHL SameDay ticket."}
        </p>
      </div>
    </div>
  );
}

function ExtractedField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-zinc-500 dark:text-zinc-400">{label}</span>
      <p className="whitespace-pre-line text-sm text-zinc-900 dark:text-zinc-100">{value}</p>
    </div>
  );
}
