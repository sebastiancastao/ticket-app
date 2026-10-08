// Extra documents (BOLs, packing lists, photos, ...) attached to an Axis order
// alongside the ticket data.
//
// Shared by the browser (to validate before upload) and the API routes (to
// enforce the same rules, since the client can be bypassed). Only uses web
// APIs, so it's safe to import from either side.

/** One file to attach to an order, as sent to the Axis portal. */
export type OrderDocumentUpload = {
  filename: string;
  contentType: string;
  bytes: ArrayBuffer;
};

/** Per-file outcome of attaching documents to an order. */
export type OrderDocumentResult = {
  filename: string;
  ok: boolean;
  error?: string;
};

// Extension -> MIME type: exactly the types the portal's own Attach File
// dialog allows. Validation goes by extension because browsers can leave
// File.type empty depending on the OS.
const ORDER_DOCUMENT_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  bmp: "image/bmp",
};

/** Value for an <input type="file" accept="..."> restricted to supported types. */
export const ORDER_DOCUMENT_ACCEPT = Object.keys(ORDER_DOCUMENT_TYPES)
  .map((ext) => `.${ext}`)
  .join(",");

export const MAX_ORDER_DOCUMENTS = 10;

// Vercel rejects function request bodies over 4.5 MB before they reach the
// route, and the files travel in the same request as the order, so keep the
// combined size under that with room for the multipart overhead.
export const MAX_ORDER_DOCUMENTS_BYTES = 4 * 1024 * 1024;

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : "";
}

export function orderDocumentContentType(filename: string, reported?: string): string {
  return ORDER_DOCUMENT_TYPES[extensionOf(filename)] ?? (reported || "application/octet-stream");
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Why this set of files can't be attached, or null when it's fine. */
export function orderDocumentProblem(files: ReadonlyArray<{ name: string; size: number }>): string | null {
  if (files.length > MAX_ORDER_DOCUMENTS) {
    return `Attach at most ${MAX_ORDER_DOCUMENTS} documents per upload.`;
  }
  const unsupported = files.filter((f) => !(extensionOf(f.name) in ORDER_DOCUMENT_TYPES));
  if (unsupported.length > 0) {
    return `Unsupported file type: ${unsupported.map((f) => f.name).join(", ")}. Use PDF, JPG, PNG, GIF, or BMP files.`;
  }
  const empty = files.filter((f) => f.size === 0);
  if (empty.length > 0) {
    return `Empty file: ${empty.map((f) => f.name).join(", ")}.`;
  }
  const total = files.reduce((sum, f) => sum + f.size, 0);
  if (total > MAX_ORDER_DOCUMENTS_BYTES) {
    return `Documents total ${formatBytes(total)}; the limit is ${formatBytes(MAX_ORDER_DOCUMENTS_BYTES)} per upload.`;
  }
  return null;
}

/**
 * Read and validate the "documents" file entries of a multipart request.
 * Returns an empty list when the request carries no documents.
 */
export async function readOrderDocuments(
  form: FormData
): Promise<{ documents: OrderDocumentUpload[] } | { error: string }> {
  const files = form.getAll("documents").filter((entry): entry is File => typeof entry !== "string");
  const problem = orderDocumentProblem(files);
  if (problem) return { error: problem };
  const documents = await Promise.all(
    files.map(async (file) => ({
      filename: file.name,
      contentType: orderDocumentContentType(file.name, file.type),
      bytes: await file.arrayBuffer(),
    }))
  );
  return { documents };
}
