// Browser-side calls to this app's Axis routes, shared by the main ticket
// board and the Missive iframe board so both submit orders the same way.

import type { DocumentMapping } from "./dhl-sameday-ticket";
import type { OrderDocumentResult } from "./order-documents";

export type SubmitOutcome =
  | { kind: "success"; orderTrackingId: string; documents: OrderDocumentResult[] }
  | { kind: "error"; message: string };

/**
 * Applies user corrections (keyed by field label) on top of the extracted
 * fields. This is what actually gets submitted, so a corrected AWB or address
 * reaches Axis. A blank edit clears the field.
 */
export function applyFieldEdits(mapping: DocumentMapping, edits: Record<string, string> | undefined): DocumentMapping {
  if (!edits) return mapping;
  return {
    ...mapping,
    fields: mapping.fields.map((f) =>
      f.label in edits ? { ...f, value: edits[f.label].trim() === "" ? null : edits[f.label] } : f
    ),
  };
}

// A body over the hosting limit is rejected before it reaches the route, with
// a non-JSON response, so `data` may be null.
function errorMessage(response: Response, data: { error?: string } | null, fallback: string): string {
  if (data?.error) return data.error;
  if (response.status === 413) return "The documents are too large to upload.";
  return `${fallback} (status ${response.status})`;
}

/** Creates a real Axis order from a ticket, attaching any extra documents. */
export async function submitToAxis(input: {
  mapping: DocumentMapping;
  sourceEmailId: string;
  documents: File[];
}): Promise<SubmitOutcome> {
  try {
    // Multipart so the extra documents travel with the order in one request.
    const form = new FormData();
    form.append("payload", JSON.stringify({ mapping: input.mapping, sourceEmailId: input.sourceEmailId }));
    for (const file of input.documents) form.append("documents", file, file.name);
    const response = await fetch("/api/axis-submit", { method: "POST", body: form });
    const data = await response.json().catch(() => null);
    if (!response.ok) throw new Error(errorMessage(response, data, "Axis submit failed"));
    return {
      kind: "success",
      orderTrackingId: String(data?.orderTrackingId ?? ""),
      documents: Array.isArray(data?.documents) ? data.documents : [],
    };
  } catch (err) {
    return { kind: "error", message: err instanceof Error ? err.message : "Failed to submit to Axis." };
  }
}

/** Attaches documents to an order that already exists. Throws if the request fails. */
export async function uploadDocumentsToAxisOrder(
  orderTrackingId: string,
  documents: File[]
): Promise<OrderDocumentResult[]> {
  const form = new FormData();
  form.append("orderTrackingId", orderTrackingId);
  for (const file of documents) form.append("documents", file, file.name);
  const response = await fetch("/api/axis-documents", { method: "POST", body: form });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(errorMessage(response, data, "Document upload failed"));
  return Array.isArray(data?.documents) ? data.documents : [];
}

/** Whether the server can attach documents to orders, or null if unknown. */
export async function fetchDocumentUploadConfigured(): Promise<boolean | null> {
  try {
    const response = await fetch("/api/axis-documents");
    if (!response.ok) return null;
    const data = (await response.json()) as { configured?: unknown };
    return typeof data.configured === "boolean" ? data.configured : null;
  } catch {
    return null;
  }
}
