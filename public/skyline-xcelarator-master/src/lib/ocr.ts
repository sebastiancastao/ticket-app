// OCR fallback for scanned (image-only) PDFs, and OCR for images sent
// directly (a phone photo or screenshot of a paper form, with no PDF at all).
//
// Some PDFs — like the DHL IAC certification — carry no text layer; their pages
// are scanned images. When direct text extraction comes up empty we render each
// page to a PNG and run Tesseract over it so the document can still be
// classified and field-mapped. A standalone JPEG/PNG (e.g. forwarded from a
// phone instead of scanned to PDF) skips the PDF-rendering step entirely and
// goes straight to Tesseract.
//
// Both deps are heavy/native and server-only; they're listed in
// `serverExternalPackages` so Next doesn't try to bundle them.

import { renderPageAsImage } from "unpdf";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

// Tesseract caches its (~10 MB) language data to disk; default is the cwd, which
// would litter the project root. Keep it inside node_modules/.cache instead.
const TESSERACT_CACHE = join(process.cwd(), "node_modules", ".cache", "tesseract");

// Render up to this many pages. OCR is slow (~1–3s/page); scanned forms are
// usually short, so this keeps latency bounded without dropping real content.
const MAX_OCR_PAGES = 10;

// Below this many extracted characters we assume the PDF has no real text layer
// and fall back to OCR.
export const TEXT_THRESHOLD = 24;

async function renderPage(
  buffer: Uint8Array,
  pageNumber: number,
): Promise<Uint8Array> {
  const img = await renderPageAsImage(buffer, pageNumber, {
    scale: 3, // upscale so small form text stays legible to the OCR engine
    canvasImport: () => import("@napi-rs/canvas"),
  });
  return new Uint8Array(img);
}

// Tesseract won't create the cache dir itself; without it the language data is
// re-downloaded on every run. Shared by both OCR entry points below.
async function createOcrWorker() {
  const { createWorker } = await import("tesseract.js");
  await mkdir(TESSERACT_CACHE, { recursive: true });
  return createWorker("eng", undefined, { cachePath: TESSERACT_CACHE });
}

/**
 * OCR a scanned PDF. Renders each page (up to MAX_OCR_PAGES) and runs Tesseract,
 * returning text formatted like the direct-extraction path ("--- Page N ---").
 * A single worker is reused across pages and always terminated.
 */
export async function ocrPdf(
  buffer: Uint8Array,
  totalPages: number,
): Promise<string> {
  const pageCount = Math.min(totalPages, MAX_OCR_PAGES);
  const worker = await createOcrWorker();
  try {
    const pages: string[] = [];
    for (let n = 1; n <= pageCount; n++) {
      const png = await renderPage(buffer, n);
      const { data } = await worker.recognize(Buffer.from(png));
      pages.push(`--- Page ${n} ---\n${data.text.trim()}`.trimEnd());
    }
    return pages.join("\n\n").trim();
  } finally {
    await worker.terminate();
  }
}

/**
 * OCR a single image (a phone photo or screenshot of a paper form, uploaded
 * directly rather than as a PDF). Reuses the same Tesseract setup as ocrPdf,
 * but recognises the image bytes as-is — there's no page to render first.
 */
export async function ocrImage(buffer: Uint8Array): Promise<string> {
  const worker = await createOcrWorker();
  try {
    const { data } = await worker.recognize(Buffer.from(buffer));
    return data.text.trim();
  } finally {
    await worker.terminate();
  }
}
