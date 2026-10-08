"use client";

// Ticket controls shared by the main board and the Missive iframe board:
// editable extracted fields, plus the extra documents attached to an order.

import { useEffect, useState } from "react";
import { fetchDocumentUploadConfigured, uploadDocumentsToAxisOrder } from "@/lib/axis-client";
import type { DocumentMapping } from "@/lib/dhl-sameday-ticket";
import {
  formatBytes,
  MAX_ORDER_DOCUMENTS,
  MAX_ORDER_DOCUMENTS_BYTES,
  ORDER_DOCUMENT_ACCEPT,
  orderDocumentProblem,
  type OrderDocumentResult,
} from "@/lib/order-documents";

/** Whether the server can attach documents to orders; null until it answers. */
export function useDocumentUploadConfigured(): boolean | null {
  const [configured, setConfigured] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    void fetchDocumentUploadConfigured().then((value) => {
      if (!cancelled) setConfigured(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return configured;
}

/**
 * User corrections to extracted field values, keyed by email id then field
 * label. Kept apart from the emails themselves so a re-fetch or rescan
 * doesn't clobber in-progress edits.
 */
export function useFieldEdits() {
  const [edits, setEdits] = useState<Record<string, Record<string, string>>>({});

  function change(key: string, label: string, value: string) {
    setEdits((prev) => ({ ...prev, [key]: { ...prev[key], [label]: value } }));
  }

  function reset(key: string, label: string) {
    setEdits((prev) => {
      if (!prev[key] || !(label in prev[key])) return prev;
      const keyEdits = { ...prev[key] };
      delete keyEdits[label];
      return { ...prev, [key]: keyEdits };
    });
  }

  return { editsFor: (key: string) => edits[key], change, reset };
}

/**
 * Extra documents per ticket, keyed by email id. A file stays pending until
 * it's attached to the order, so a failed upload can be retried.
 */
export function useOrderDocuments() {
  const [pending, setPending] = useState<Record<string, File[]>>({});
  const [attached, setAttached] = useState<Record<string, string[]>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);

  function add(key: string, picked: File[]) {
    if (picked.length === 0) return;
    const existing = pending[key] ?? [];
    const isDuplicate = (file: File) =>
      existing.some((e) => e.name === file.name && e.size === file.size && e.lastModified === file.lastModified);
    const next = [...existing, ...picked.filter((file) => !isDuplicate(file))];
    const problem = orderDocumentProblem(next);
    setErrors((prev) => ({ ...prev, [key]: problem ?? "" }));
    if (!problem) setPending((prev) => ({ ...prev, [key]: next }));
  }

  function remove(key: string, file: File) {
    setPending((prev) => ({ ...prev, [key]: (prev[key] ?? []).filter((f) => f !== file) }));
    setErrors((prev) => ({ ...prev, [key]: "" }));
  }

  // `results[i]` is the outcome for `sent[i]`. Attached files move from the
  // pending list to the attached list; failed ones stay pending for a retry.
  function applyResults(key: string, sent: File[], results: OrderDocumentResult[]) {
    if (sent.length === 0) return;
    const done = new Set(sent.filter((_, i) => results[i]?.ok));
    const failures = results.filter((r) => !r.ok);
    setPending((prev) => ({ ...prev, [key]: (prev[key] ?? []).filter((f) => !done.has(f)) }));
    setAttached((prev) => ({
      ...prev,
      [key]: [...(prev[key] ?? []), ...results.filter((r) => r.ok).map((r) => r.filename)],
    }));
    setErrors((prev) => ({
      ...prev,
      [key]: failures.map((f) => `${f.filename}: ${f.error ?? "Upload failed."}`).join("\n"),
    }));
  }

  function setError(key: string, message: string) {
    setErrors((prev) => ({ ...prev, [key]: message }));
  }

  // Attaches a ticket's pending documents to its order, which already exists.
  async function uploadTo(key: string, orderTrackingId: string) {
    const files = pending[key] ?? [];
    if (!orderTrackingId || files.length === 0 || uploadingFor !== null) return;
    setUploadingFor(key);
    try {
      applyResults(key, files, await uploadDocumentsToAxisOrder(orderTrackingId, files));
    } catch (err) {
      setError(key, err instanceof Error ? err.message : "Failed to upload documents to Axis.");
    } finally {
      setUploadingFor(null);
    }
  }

  return {
    pendingFor: (key: string) => pending[key] ?? [],
    attachedFor: (key: string) => attached[key] ?? [],
    errorFor: (key: string) => errors[key] ?? "",
    /** The email id whose documents are uploading, if any. */
    uploadingFor,
    add,
    remove,
    applyResults,
    uploadTo,
  };
}

export function OrderDocumentsSection({
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

/** A ticket's extracted fields, each editable, with the user's edits applied. */
export function EditableTicketFields({
  mapping,
  edits,
  disabled,
  onChange,
  onReset,
}: {
  mapping: DocumentMapping;
  edits: Record<string, string> | undefined;
  disabled: boolean;
  onChange: (label: string, value: string) => void;
  onReset: (label: string) => void;
}) {
  return (
    <>
      {mapping.fields.map((field) => {
        const edited = edits?.[field.label];
        return (
          <EditableTicketField
            key={field.label}
            label={field.label}
            value={edited ?? field.value ?? ""}
            isEdited={edited !== undefined && edited !== (field.value ?? "")}
            disabled={disabled}
            onChange={(value) => onChange(field.label, value)}
            onReset={() => onReset(field.label)}
          />
        );
      })}
    </>
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
