"use client";

import { useEffect, useMemo, useState } from "react";
import { MOCK_EMAILS } from "@/lib/mock-emails";
import { extractShipmentData } from "@/lib/extract-shipment-data";
import type { MissiveEmail } from "@/lib/missive";
import type { DocumentMapping } from "@/lib/dhl-sameday-ticket";
import { AXIS_SUBMITTABLE_TYPES } from "@/lib/axis-map";
import type { TicketPriority } from "@/lib/tickets";
import {
  formatBytes,
  MAX_ORDER_DOCUMENTS,
  MAX_ORDER_DOCUMENTS_BYTES,
  ORDER_DOCUMENT_ACCEPT,
  orderDocumentProblem,
  type OrderDocumentResult,
} from "@/lib/order-documents";

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

type SubmitOutcome =
  | { kind: "success"; orderTrackingId: string; documents: OrderDocumentResult[] }
  | { kind: "error"; message: string };
type SubmitStatus = { kind: "idle" } | { kind: "submitting" } | SubmitOutcome;
type BulkStatus =
  | { kind: "idle" }
  | { kind: "running"; total: number; done: number }
  | { kind: "done"; succeeded: number; failed: number };
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
  const [selectedId, setSelectedId] = useState("");
  const [status, setStatus] = useState<SubmitStatus>({ kind: "idle" });
  const [bulkStatus, setBulkStatus] = useState<BulkStatus>({ kind: "idle" });
  const [results, setResults] = useState<Record<string, SubmitOutcome>>({});
  // User corrections to extracted field values, keyed by email id then field
  // label. Kept separate from `emails` so a re-fetch of the inbox doesn't
  // clobber in-progress edits.
  const [fieldEdits, setFieldEdits] = useState<Record<string, Record<string, string>>>({});
  // Extra files to attach to each ticket's Axis order, keyed by email id. A
  // file stays here until it's attached, so a failed upload can be retried.
  const [pendingDocs, setPendingDocs] = useState<Record<string, File[]>>({});
  // Names of files already attached to each ticket's order.
  const [attachedDocs, setAttachedDocs] = useState<Record<string, string[]>>({});
  const [docErrors, setDocErrors] = useState<Record<string, string>>({});
  // null until the server answers; false disables the file picker.
  const [docUploadConfigured, setDocUploadConfigured] = useState<boolean | null>(null);
  const [uploadingDocsFor, setUploadingDocsFor] = useState<string | null>(null);

  // Only emails with a recognized document (DHL SameDay ticket, AIT delivery
  // order, ...) show up in the board — everything else is inbox noise
  // (quote requests, replies, etc.). Not every recognized type is
  // submittable to Axis yet; see AXIS_SUBMITTABLE_TYPES.
  const ticketEmails = useMemo(() => emails.filter((email) => email.ticketMapping), [emails]);
  const submittableTicketEmails = useMemo(
    () =>
      ticketEmails.filter((email) => email.ticketMapping && AXIS_SUBMITTABLE_TYPES.has(email.ticketMapping.type)),
    [ticketEmails]
  );
  // Tickets that haven't already been created as an Axis order — reprocessing
  // a success would create a duplicate real dispatch order.
  const pendingTicketEmails = useMemo(
    () => submittableTicketEmails.filter((email) => results[email.id]?.kind !== "success"),
    [submittableTicketEmails, results]
  );
  const isBusy = status.kind === "submitting" || bulkStatus.kind === "running" || uploadingDocsFor !== null;

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
        setSelectedId(data.emails.find((email) => email.ticketMapping)?.id ?? "");
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

  useEffect(() => {
    let cancelled = false;
    fetch("/api/axis-documents")
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { configured?: boolean } | null) => {
        if (!cancelled && typeof data?.configured === "boolean") setDocUploadConfigured(data.configured);
      })
      .catch(() => {
        // Unknown: leave the picker enabled and let the server report it.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedEmail = ticketEmails.find((email) => email.id === selectedId);
  const extracted = useMemo(
    () => (selectedEmail ? extractShipmentData(selectedEmail) : null),
    [selectedEmail]
  );
  const downloadableAttachments =
    selectedEmail?.messageId && selectedEmail.attachments?.length
      ? { messageId: selectedEmail.messageId, attachments: selectedEmail.attachments }
      : null;

  const selectedResult = selectedEmail ? results[selectedEmail.id] : undefined;
  const alreadySubmitted = selectedResult?.kind === "success";
  const isSubmittableTicket =
    !!selectedEmail?.ticketMapping &&
    AXIS_SUBMITTABLE_TYPES.has(selectedEmail.ticketMapping.type) &&
    !alreadySubmitted;

  function handleSelect(id: string) {
    setSelectedId(id);
    setStatus({ kind: "idle" });
  }

  function handleFieldChange(emailId: string, label: string, value: string) {
    setFieldEdits((prev) => ({
      ...prev,
      [emailId]: { ...prev[emailId], [label]: value },
    }));
  }

  function handleFieldReset(emailId: string, label: string) {
    setFieldEdits((prev) => {
      if (!prev[emailId] || !(label in prev[emailId])) return prev;
      const emailEdits = { ...prev[emailId] };
      delete emailEdits[label];
      return { ...prev, [emailId]: emailEdits };
    });
  }

  function handleAddDocuments(emailId: string, picked: File[]) {
    if (picked.length === 0) return;
    const existing = pendingDocs[emailId] ?? [];
    const isDuplicate = (file: File) =>
      existing.some((e) => e.name === file.name && e.size === file.size && e.lastModified === file.lastModified);
    const next = [...existing, ...picked.filter((file) => !isDuplicate(file))];
    const problem = orderDocumentProblem(next);
    setDocErrors((prev) => ({ ...prev, [emailId]: problem ?? "" }));
    if (!problem) setPendingDocs((prev) => ({ ...prev, [emailId]: next }));
  }

  function handleRemoveDocument(emailId: string, file: File) {
    setPendingDocs((prev) => ({ ...prev, [emailId]: (prev[emailId] ?? []).filter((f) => f !== file) }));
    setDocErrors((prev) => ({ ...prev, [emailId]: "" }));
  }

  // `docResults[i]` is the outcome for `sent[i]`. Attached files move from the
  // pending list to the attached list; failed ones stay pending for a retry.
  function applyDocumentResults(emailId: string, sent: File[], docResults: OrderDocumentResult[]) {
    if (sent.length === 0) return;
    const attached = new Set(sent.filter((_, i) => docResults[i]?.ok));
    const failures = docResults.filter((r) => !r.ok);
    setPendingDocs((prev) => ({ ...prev, [emailId]: (prev[emailId] ?? []).filter((f) => !attached.has(f)) }));
    setAttachedDocs((prev) => ({
      ...prev,
      [emailId]: [...(prev[emailId] ?? []), ...docResults.filter((r) => r.ok).map((r) => r.filename)],
    }));
    setDocErrors((prev) => ({
      ...prev,
      [emailId]: failures.map((f) => `${f.filename}: ${f.error ?? "Upload failed."}`).join("\n"),
    }));
  }

  // Applies any user edits on top of the extracted fields — this is what
  // actually gets submitted, so a corrected AWB or address reaches Axis.
  function effectiveMapping(email: MissiveEmail): DocumentMapping | undefined {
    const mapping = email.ticketMapping;
    if (!mapping) return undefined;
    const edits = fieldEdits[email.id];
    if (!edits) return mapping;
    return {
      ...mapping,
      fields: mapping.fields.map((f) =>
        f.label in edits ? { ...f, value: edits[f.label].trim() === "" ? null : edits[f.label] } : f
      ),
    };
  }

  async function submitTicket(email: MissiveEmail): Promise<SubmitOutcome> {
    const docs = pendingDocs[email.id] ?? [];
    try {
      // Multipart so the extra documents travel with the order in one request.
      const form = new FormData();
      form.append("payload", JSON.stringify({ mapping: effectiveMapping(email), sourceEmailId: email.id }));
      for (const file of docs) form.append("documents", file, file.name);
      const response = await fetch("/api/axis-submit", { method: "POST", body: form });
      // A body over the hosting limit is rejected before it reaches the route,
      // with a non-JSON response.
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          data?.error ??
            (response.status === 413
              ? "The documents are too large to upload."
              : `Axis submit failed (status ${response.status})`)
        );
      }
      const documents: OrderDocumentResult[] = Array.isArray(data?.documents) ? data.documents : [];
      applyDocumentResults(email.id, docs, documents);
      return { kind: "success", orderTrackingId: String(data?.orderTrackingId ?? ""), documents };
    } catch (err) {
      return { kind: "error", message: err instanceof Error ? err.message : "Failed to submit to Axis." };
    }
  }

  // Attaches pending documents to a ticket whose order already exists.
  async function handleUploadDocuments(email: MissiveEmail) {
    const result = results[email.id];
    const docs = pendingDocs[email.id] ?? [];
    if (result?.kind !== "success" || !result.orderTrackingId || docs.length === 0 || isBusy) return;
    setUploadingDocsFor(email.id);
    try {
      const form = new FormData();
      form.append("orderTrackingId", result.orderTrackingId);
      for (const file of docs) form.append("documents", file, file.name);
      const response = await fetch("/api/axis-documents", { method: "POST", body: form });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          data?.error ??
            (response.status === 413
              ? "The documents are too large to upload."
              : `Document upload failed (status ${response.status})`)
        );
      }
      applyDocumentResults(email.id, docs, Array.isArray(data?.documents) ? data.documents : []);
    } catch (err) {
      setDocErrors((prev) => ({
        ...prev,
        [email.id]: err instanceof Error ? err.message : "Failed to upload documents to Axis.",
      }));
    } finally {
      setUploadingDocsFor(null);
    }
  }

  async function handleSubmit() {
    if (!selectedEmail?.ticketMapping || isBusy) return;
    setStatus({ kind: "submitting" });
    const result = await submitTicket(selectedEmail);
    setResults((prev) => ({ ...prev, [selectedEmail.id]: result }));
    setStatus(result);
  }

  async function handleProcessAll() {
    if (isBusy || pendingTicketEmails.length === 0) return;
    const targets = pendingTicketEmails;
    const docCount = targets.reduce((sum, email) => sum + (pendingDocs[email.id]?.length ?? 0), 0);
    const confirmed = window.confirm(
      `This will submit ${targets.length} ticket${
        targets.length === 1 ? "" : "s"
      } to Axis and create real dispatch orders in Skyline's production system${
        docCount ? `, attaching ${docCount} extra document${docCount === 1 ? "" : "s"}` : ""
      }. Continue?`
    );
    if (!confirmed) return;

    setBulkStatus({ kind: "running", total: targets.length, done: 0 });
    let succeeded = 0;
    let failed = 0;
    // Sequential, not Promise.all: each submission logs into the same portal
    // session/account and the Axis ClientPortal doesn't tolerate concurrent
    // order creation from one login.
    for (const email of targets) {
      const result = await submitTicket(email);
      setResults((prev) => ({ ...prev, [email.id]: result }));
      if (result.kind === "success") succeeded += 1;
      else failed += 1;
      setBulkStatus((prev) => (prev.kind === "running" ? { ...prev, done: prev.done + 1 } : prev));
    }
    setBulkStatus({ kind: "done", succeeded, failed });
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
              ? "Tickets (live)"
              : source === "loading"
                ? "Tickets (loading…)"
                : "Tickets (mock — live inbox unavailable)"}
          </p>
          {ticketEmails.length === 0 ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {source === "live"
                ? "No tickets in this mailbox scope yet."
                : "No tickets in the mock inbox."}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {ticketEmails.map((email) => {
                const isSelected = email.id === selectedId;
                const result = results[email.id];
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
                          {result?.kind === "success" && (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                              Submitted
                            </span>
                          )}
                          {result?.kind === "success" && result.documents.some((d) => !d.ok) && (
                            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
                              Docs failed
                            </span>
                          )}
                          {result?.kind === "error" && (
                            <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-medium text-red-700 dark:bg-red-500/10 dark:text-red-400">
                              Failed
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
              {selectedEmail.ticketMapping.fields.map((field) => {
                const emailId = selectedEmail.id;
                const edited = fieldEdits[emailId]?.[field.label];
                const currentValue = edited ?? field.value ?? "";
                const isEdited = edited !== undefined && edited !== (field.value ?? "");
                return (
                  <EditableTicketField
                    key={field.label}
                    label={field.label}
                    value={currentValue}
                    isEdited={isEdited}
                    disabled={isBusy || alreadySubmitted}
                    onChange={(value) => handleFieldChange(emailId, field.label, value)}
                    onReset={() => handleFieldReset(emailId, field.label)}
                  />
                );
              })}
              {AXIS_SUBMITTABLE_TYPES.has(selectedEmail.ticketMapping.type) && (
                <OrderDocumentsSection
                  pending={pendingDocs[selectedEmail.id] ?? []}
                  attached={attachedDocs[selectedEmail.id] ?? []}
                  error={docErrors[selectedEmail.id] ?? ""}
                  configured={docUploadConfigured}
                  orderTrackingId={selectedResult?.kind === "success" ? selectedResult.orderTrackingId : ""}
                  disabled={isBusy}
                  uploading={uploadingDocsFor === selectedEmail.id}
                  onAdd={(files) => handleAddDocuments(selectedEmail.id, files)}
                  onRemove={(file) => handleRemoveDocument(selectedEmail.id, file)}
                  onUpload={() => handleUploadDocuments(selectedEmail)}
                />
              )}
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
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!isSubmittableTicket || isBusy}
            className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-[#ccc]"
          >
            {status.kind === "submitting" ? "Submitting…" : "Submit to Xcelerator"}
          </button>
          <button
            type="button"
            onClick={handleProcessAll}
            disabled={pendingTicketEmails.length === 0 || isBusy}
            className="rounded-full border border-black/[.15] px-5 py-2.5 text-sm font-medium text-zinc-950 transition-colors hover:bg-black/[.03] disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[.2] dark:text-zinc-50 dark:hover:bg-[#141414]"
          >
            {bulkStatus.kind === "running"
              ? `Processing ${bulkStatus.done}/${bulkStatus.total}…`
              : `Process All Tickets${pendingTicketEmails.length ? ` (${pendingTicketEmails.length})` : ""}`}
          </button>
          {status.kind === "success" && (
            <span className="text-sm text-emerald-600 dark:text-emerald-400">
              Order created — Axis tracking ID {status.orderTrackingId} ✓
              {status.documents.length > 0 && status.documents.every((d) => d.ok) && (
                <>
                  {" "}
                  · {status.documents.length} document{status.documents.length === 1 ? "" : "s"} attached
                </>
              )}
            </span>
          )}
          {status.kind === "success" && status.documents.some((d) => !d.ok) && (
            <span className="text-sm text-amber-600 dark:text-amber-400">
              {status.documents.filter((d) => !d.ok).length} of {status.documents.length} documents didn&apos;t
              attach. Retry them from the ticket.
            </span>
          )}
          {status.kind === "error" && (
            <span className="text-sm text-red-600 dark:text-red-400">{status.message}</span>
          )}
          {bulkStatus.kind === "done" && (
            <span
              className={`text-sm ${
                bulkStatus.failed > 0
                  ? "text-red-600 dark:text-red-400"
                  : "text-emerald-600 dark:text-emerald-400"
              }`}
            >
              Processed {bulkStatus.succeeded + bulkStatus.failed} ticket
              {bulkStatus.succeeded + bulkStatus.failed === 1 ? "" : "s"} — {bulkStatus.succeeded} created
              {bulkStatus.failed > 0 ? `, ${bulkStatus.failed} failed` : ""}.
            </span>
          )}
        </div>
        <p className="text-xs text-zinc-400 dark:text-zinc-500">
          {alreadySubmitted
            ? "This ticket has already been submitted to Axis."
            : isSubmittableTicket
              ? "Creates a real dispatch order in Skyline's Axis system — this is not a simulation. \"Process All Tickets\" submits every pending ticket the same way, one at a time."
              : "Only available for document types configured for Axis submission (currently: DHL SameDay ticket)."}
        </p>
      </div>
    </div>
  );
}

function OrderDocumentsSection({
  pending,
  attached,
  error,
  configured,
  orderTrackingId,
  disabled,
  uploading,
  onAdd,
  onRemove,
  onUpload,
}: {
  pending: File[];
  attached: string[];
  error: string;
  configured: boolean | null;
  /** Set once the ticket's order exists; files then go straight onto it. */
  orderTrackingId: string;
  disabled: boolean;
  uploading: boolean;
  onAdd: (files: File[]) => void;
  onRemove: (file: File) => void;
  onUpload: () => void;
}) {
  const addDisabled = disabled || configured === false;
  return (
    <div className="flex flex-col gap-2 border-t border-black/[.08] pt-3 dark:border-white/[.1]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-zinc-500 dark:text-zinc-400">Extra documents</span>
        <label
          className={`inline-flex items-center rounded-full border border-black/[.08] px-3 py-1 text-xs font-medium text-zinc-700 transition-colors focus-within:ring-2 focus-within:ring-zinc-400 dark:border-white/[.1] dark:text-zinc-300 ${
            addDisabled ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:bg-black/[.03] dark:hover:bg-[#141414]"
          }`}
        >
          + Add files
          <input
            type="file"
            multiple
            accept={ORDER_DOCUMENT_ACCEPT}
            disabled={addDisabled}
            className="sr-only"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              // Reset so picking the same file again still fires onChange.
              e.target.value = "";
              onAdd(files);
            }}
          />
        </label>
      </div>

      {configured === false && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          Document upload to Axis isn&apos;t configured on the server yet (AXIS_DOCUMENT_UPLOAD_PATH).
        </p>
      )}

      {attached.length > 0 && (
        <ul className="flex flex-col gap-1">
          {attached.map((name, i) => (
            <li key={`${name}-${i}`} className="truncate text-xs text-emerald-700 dark:text-emerald-400">
              ✓ {name}
            </li>
          ))}
        </ul>
      )}

      {pending.length > 0 && (
        <ul className="flex flex-col gap-1">
          {pending.map((file, i) => (
            <li
              key={`${file.name}-${file.size}-${file.lastModified}-${i}`}
              className="flex items-center justify-between gap-2 rounded-md border border-black/[.08] px-2 py-1 text-xs dark:border-white/[.1]"
            >
              <span className="truncate text-zinc-800 dark:text-zinc-200">{file.name}</span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="text-zinc-400 dark:text-zinc-500">{formatBytes(file.size)}</span>
                <button
                  type="button"
                  onClick={() => onRemove(file)}
                  disabled={disabled}
                  aria-label={`Remove ${file.name}`}
                  className="rounded px-1 text-zinc-400 hover:text-zinc-700 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:text-zinc-200"
                >
                  ×
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {error && <p className="whitespace-pre-line text-xs text-red-600 dark:text-red-400">{error}</p>}

      {orderTrackingId && pending.length > 0 && (
        <button
          type="button"
          onClick={onUpload}
          disabled={disabled || configured === false}
          className="w-fit rounded-full bg-foreground px-4 py-1.5 text-xs font-medium text-background transition-colors hover:bg-[#383838] disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-[#ccc]"
        >
          {uploading
            ? "Uploading…"
            : `Upload ${pending.length} document${pending.length === 1 ? "" : "s"} to order ${orderTrackingId}`}
        </button>
      )}

      <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
        {orderTrackingId ? "Added to the existing Axis order." : "Sent with the order when you submit."} PDF, image,
        Word, or Excel. Up to {MAX_ORDER_DOCUMENTS} files, {formatBytes(MAX_ORDER_DOCUMENTS_BYTES)} total.
      </p>
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

function EditableTicketField({
  label,
  value,
  isEdited,
  disabled,
  onChange,
  onReset,
}: {
  label: string;
  value: string;
  isEdited: boolean;
  disabled: boolean;
  onChange: (value: string) => void;
  onReset: () => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-zinc-500 dark:text-zinc-400">{label}</span>
        {isEdited && (
          <button
            type="button"
            onClick={onReset}
            className="text-[10px] font-medium text-zinc-400 hover:text-zinc-600 hover:underline dark:hover:text-zinc-300"
          >
            Reset
          </button>
        )}
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder="Not found"
        rows={Math.min(4, Math.max(1, value.split("\n").length))}
        className={`w-full resize-none rounded-md border bg-transparent px-2 py-1.5 text-sm text-zinc-900 outline-none transition-colors focus:border-zinc-950 disabled:cursor-not-allowed disabled:opacity-60 dark:text-zinc-100 dark:focus:border-zinc-50 ${
          isEdited
            ? "border-amber-400 dark:border-amber-500/60"
            : "border-black/[.1] dark:border-white/[.145]"
        }`}
      />
    </div>
  );
}
