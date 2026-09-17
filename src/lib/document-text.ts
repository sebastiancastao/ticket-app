// Shared plain-text helpers for turning labeled document text (PDF text from
// pdf-text.ts, or a plain-text email body) into field values. Split out of
// dhl-sameday-ticket.ts when a second document classifier (ait-delivery-order.ts)
// needed the same helpers — keep this dependency-free so every classifier
// that imports it stays easy to unit-test.

// Collapse all whitespace runs (including newlines) to single spaces and trim.
export function flatten(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

// Tidy a captured raw value: drop OCR-ish leader dots/ellipses, collapse
// whitespace, strip trailing punctuation, and reject anything with no
// alphanumeric content (i.e. a label matched but nothing useful followed it).
export function cleanValue(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const v = raw
    .replace(/[._…]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[\s,;:|]+$/, "")
    .trim();
  if (!/[A-Za-z0-9]/.test(v)) return null;
  return v.length > 0 ? v : null;
}

// The rest of a line following a label, e.g. valueAfter(text, "Cust Name").
// `label` is spliced into a RegExp, so a caller can pass a regex fragment
// (e.g. "Deliver\s*To") rather than a literal label when the wording varies.
export function valueAfter(text: string, label: string): string | null {
  const re = new RegExp(`${label}[^\S\r\n]*:?[^\S\r\n]*([^\r\n]*)`, "i");
  const m = text.match(re);
  return m ? cleanValue(m[1]) : null;
}

// Match an arbitrary regex against the flattened (whitespace-collapsed) text
// and clean its first capture group.
export function capture(text: string, re: RegExp): string | null {
  const m = flatten(text).match(re);
  return m ? cleanValue(m[1]) : null;
}

// Lines following a label, up to the next blank line or (if given) the next
// line starting with one of the stop labels — for a multi-line block such as
// a name-and-address that runs across several lines rather than sharing a
// line with its label. Returns null when the label is not found or nothing
// usable follows it.
export function blockAfter(text: string, label: string, stopLabels: string[] = []): string | null {
  const lines = text.split(/\r?\n/);
  const labelRe = new RegExp(`^\s*${label}\s*:?\s*(.*)$`, "i");
  const stopRe = stopLabels.length ? new RegExp(`^\s*(${stopLabels.join("|")})\b`, "i") : null;

  const startIdx = lines.findIndex((l) => labelRe.test(l));
  if (startIdx === -1) return null;

  const firstLineRest = lines[startIdx].match(labelRe)?.[1]?.trim() ?? "";
  const collected: string[] = firstLineRest ? [firstLineRest] : [];

  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) break;
    if (stopRe && stopRe.test(line)) break;
    collected.push(line.trim());
  }

  const joined = collected.join("\n").trim();
  return joined || null;
}
