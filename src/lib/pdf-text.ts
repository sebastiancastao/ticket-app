import { getDocumentProxy } from "unpdf";

// Ported from skyline-xcelerator's src/app/api/parse/route.ts. pdf.js returns
// text in positioned fragments with no guaranteed spaces between them; the
// dhl-sameday-ticket regexes were tuned against this exact reconstruction, so
// a different PDF-to-text approach (e.g. a different library's default join)
// would silently break them.

// A pdf.js text fragment.
type TextItem = {
  str: string;
  hasEOL: boolean;
  width: number;
  height: number;
  transform: number[]; // [a, b, c, d, e(x), f(y)]
};

function endsWithSpace(s: string) {
  return s.length === 0 || /\s$/.test(s);
}

// Rebuild readable text from positioned fragments: insert a space when there
// is a horizontal gap between fragments, and a newline on end-of-line
// markers or a vertical jump.
function reconstructPageText(items: TextItem[]): string {
  let out = "";
  let prev: TextItem | null = null;

  for (const item of items) {
    const str = item.str ?? "";

    if (prev) {
      const prevX = prev.transform[4];
      const prevY = prev.transform[5];
      const x = item.transform[4];
      const y = item.transform[5];

      const lineHeight = item.height || prev.height || 10;
      const verticalJump = Math.abs(y - prevY);

      if (verticalJump > lineHeight * 0.5) {
        out = out.replace(/[ \t]+$/, "") + "\n";
      } else {
        const prevEndX = prevX + prev.width;
        const gap = x - prevEndX;
        const spaceWidth = lineHeight * 0.25;
        if (gap > spaceWidth && !endsWithSpace(out) && !/^\s/.test(str)) {
          out += " ";
        }
      }
    }

    out += str;

    if (item.hasEOL) {
      out = out.replace(/[ \t]+$/, "") + "\n";
      prev = null;
      continue;
    }
    prev = item;
  }

  return out;
}

function tidy(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Below this many extracted characters, treat the PDF as having no real text
// layer (a scanned image). There's no OCR fallback here (unlike the source
// project) — this just returns the sparse/empty text, which will fail to
// match any document type rather than being silently misread.
export const TEXT_THRESHOLD = 24;

export async function extractPdfText(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(bytes);
  const pages: string[] = [];

  for (let n = 1; n <= pdf.numPages; n++) {
    const page = await pdf.getPage(n);
    const content = await page.getTextContent();
    const items = content.items.filter(
      (i) => typeof (i as { str?: unknown }).str === "string"
    ) as unknown as TextItem[];
    pages.push(tidy(reconstructPageText(items)));
  }

  return pages
    .map((p, i) => `--- Page ${i + 1} ---\n${p}`.trimEnd())
    .join("\n\n")
    .trim();
}
