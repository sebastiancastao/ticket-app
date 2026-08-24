// Ported from skyline-xcelerator's src/lib/documents.ts — the DHL_SAMEDAY_TICKET
// definition and the shared helpers it depends on. Trimmed to just this one
// document type (the source file classifies 6; this app only needs the
// dispatch/routing ticket that DHL SameDay job-alert emails carry as a PDF
// attachment).

export type MappedField = {
  /** Human-readable field name, e.g. "Air Waybill Number". */
  label: string;
  /** Extracted value, or null when the field is present but blank. */
  value: string | null;
};

export type DocumentMapping = {
  type: string;
  label: string;
  /** Rough confidence in the match, 0-1. */
  confidence: number;
  fields: MappedField[];
};

const MIN_CONFIDENCE = 0.5;

// --- Text helpers (verbatim from the source) --------------------------------

function flatten(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function cleanValue(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const v = raw
    .replace(/[._…]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/[\s,;:|]+$/, "")
    .trim();
  if (!/[A-Za-z0-9]/.test(v)) return null;
  return v.length > 0 ? v : null;
}

function valueAfter(text: string, label: string): string | null {
  const re = new RegExp(`${label}[^\\S\\r\\n]*:?[^\\S\\r\\n]*([^\\r\\n]*)`, "i");
  const m = text.match(re);
  return m ? cleanValue(m[1]) : null;
}

function capture(text: string, re: RegExp): string | null {
  const m = flatten(text).match(re);
  return m ? cleanValue(m[1]) : null;
}

const AIRLINE_NAMES: Record<string, string> = {
  AA: "American Airlines",
  AS: "Alaska Airlines",
  B6: "JetBlue Airways",
  DL: "Delta Air Lines",
  F9: "Frontier Airlines",
  NK: "Spirit Airlines",
  UA: "United Airlines",
  WN: "Southwest Airlines",
};

function airlineName(code: string | null): string | null {
  if (!code) return null;
  return AIRLINE_NAMES[code.toUpperCase()] ?? code;
}

function normalizeVendorName(value: string | null): string | null {
  if (!value) return null;
  if (/skyline courier/i.test(value)) return "Skyline Courier & Logistics";
  return value;
}

// Convert a "YY/MM/DD" routing date (e.g. "26/06/08") to ISO "20YY-MM-DD".
function isoFromYYMMDD(raw: string | null): string | null {
  if (!raw) return null;
  const m = raw.match(/(\d{2})\/(\d{2})\/(\d{2})/);
  return m ? `20${m[1]}-${m[2]}-${m[3]}` : raw;
}

// Build a multi-line "Name / street / city / Attn" address from the lines
// that follow an "Address" label on the dispatch ticket, appending the
// phone. Preserves line breaks (AWB address boxes are multi-line) and strips
// a trailing e-mail that OCR/extraction leaves on the Attn line.
function composeAddress(block: string | undefined, phone?: string): string | null {
  if (!block) return null;
  const lines = block
    .split("\n")
    .map((l) => l.replace(/\s+[\w.+-]+@[\w.-]+\b.*$/, "").trim())
    .filter(Boolean);
  if (lines.length === 0) return null;
  return phone ? `${lines.join("\n")}\nTel: ${phone}` : lines.join("\n");
}

type RoutingLeg = {
  dep: string | null;
  carrier: string | null;
  flight: string | null;
  date: string | null;
  des: string | null;
  awb: string | null;
};

// Parse the routing table's flight legs. A single-leg ticket prints one row
// ("ATL DL 0987 26/06/08 07:10 09:45 BOS F"), but a connecting itinerary
// prints the table *column by column*, so every leg's departures stack
// together, then every carrier, then every flight number, and so on — a
// per-row regex would miss all of them. Tokenising the routing block and
// bucketing each token by its shape recovers the legs for both layouts: the
// i-th departure, carrier, flight number and date make up leg i. Airports
// fill two columns (Dep then Des), so the first leg-count codes are
// departures and the last are destinations; AWB numbers (6+ digits) sit in
// their own column when present.
function parseRoutingLegs(text: string): RoutingLeg[] {
  const block = text.match(/Retr\w+\s+Msg([\s\S]*?)(?:Delivery Date|Notice:|$)/i)?.[1] ?? "";

  const airports: string[] = [];
  const carriers: string[] = [];
  const flights: string[] = [];
  const dates: string[] = [];
  const awbs: string[] = [];
  for (const token of block.split(/\s+/)) {
    if (/^\d{2}\/\d{2}\/\d{2}$/.test(token)) dates.push(token);
    else if (/^\d{6,}$/.test(token)) awbs.push(token);
    else if (/^[A-Z]{3}$/.test(token)) airports.push(token);
    else if (/^(?=[A-Z0-9]*[A-Z])[A-Z0-9]{2}$/.test(token)) carriers.push(token);
    else if (/^\d{2,4}$/.test(token)) flights.push(token);
  }

  const legCount = Math.max(
    dates.length,
    carriers.length,
    flights.length,
    Math.floor(airports.length / 2)
  );
  if (legCount === 0) return [];

  const deps = airports.slice(0, legCount);
  const dests = airports.slice(Math.max(airports.length - legCount, legCount));
  return Array.from({ length: legCount }, (_, i) => ({
    dep: deps[i] ?? null,
    carrier: carriers[i] ?? null,
    flight: flights[i] ?? null,
    date: dates[i] ?? null,
    des: dests[i] ?? null,
    awb: awbs[i] ?? null,
  }));
}

function matchDhlSamedayTicket(text: string): number {
  const flat = flatten(text).toLowerCase();
  let score = 0;
  if (/dhl\s*sameday\/sky courier/.test(flat)) score += 0.5;
  if (/ticket#\s*\d+/.test(flat)) score += 0.2;
  if (/air waybill#:\s*\d+/.test(flat)) score += 0.2;
  if (/routing info/.test(flat)) score += 0.1;
  return Math.min(score, 1);
}

function extractDhlSamedayTicketFields(text: string): MappedField[] {
  // Pickup/delivery address blocks: the lines after each "Address" label up
  // to the next blank line, with their phones (in document order).
  const blocks = [...text.matchAll(/Address\s+([\s\S]*?)(?=\n[ \t]*\n)/g)].map((m) => m[1]);
  const phones = [...text.matchAll(/Phone\s*(\(\d{3}\)\s*\d{3}-?\d{4})/g)].map((m) => m[1]);

  // Routing legs: a connecting itinerary lists more than one (e.g. ATL->DEN
  // then DEN->SNA), so capture them all — the first leg's origin is the
  // departure and the last leg's destination is the final airport.
  const legs = parseRoutingLegs(text);
  const firstLeg = legs[0] ?? null;
  const lastLeg = legs[legs.length - 1] ?? null;

  const joinLegs = (fn: (l: RoutingLeg) => string | null) =>
    legs.length ? legs.map(fn).join(" / ") : null;

  // Air waybill(s): connecting legs each print their own AWB# in the routing
  // table; a direct flight instead prints a single master AWB at the foot.
  const legAwbs = legs.map((l) => l.awb).filter((v): v is string => Boolean(v));
  const footerAwbs = [...text.matchAll(/AIR WAYBILL#:\s*(\d+)/gi)].map((m) => m[1]);
  const airWaybills = legAwbs.length ? legAwbs : footerAwbs;

  // Totals row: "Total <pcs> <wgt> <len> <wid> <hgt>".
  const totals = text.match(/Total\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)/);

  // Issuing agent city/state from the header banner.
  const agentCity = capture(text, /Sky Courier\s*-\s*[^-]*-\s*([A-Za-z .]+,\s*[A-Z]{2})/i);

  return [
    {
      label: "Air Waybill Number",
      value: airWaybills.length ? airWaybills.join(" / ") : null,
    },
    { label: "Ticket Number", value: capture(text, /Ticket#\s*(\d+)/i) },
    { label: "Customer", value: valueAfter(text, "Cust Name") },
    { label: "Reference Number", value: capture(text, /Reference#\s*(\d+)/i) },
    { label: "Description", value: valueAfter(text, "Description") },
    { label: "Pieces", value: totals ? totals[1] : null },
    { label: "Gross Weight (lb)", value: totals ? totals[2] : null },
    {
      label: "Dimensions (in)",
      value: totals ? `${totals[3]} x ${totals[4]} x ${totals[5]}` : null,
    },
    { label: "Shipper Name and Address", value: composeAddress(blocks[0], phones[0]) },
    { label: "Consignee Name and Address", value: composeAddress(blocks[1], phones[1]) },
    { label: "Origin Airport", value: firstLeg?.dep ?? null },
    { label: "Destination Airport", value: lastLeg?.des ?? null },
    { label: "Carrier", value: firstLeg?.carrier ?? null },
    { label: "Airline Tendered", value: airlineName(firstLeg?.carrier ?? null) },
    { label: "Flight Number", value: joinLegs((l) => l.flight) },
    { label: "Flight Date", value: joinLegs((l) => isoFromYYMMDD(l.date)) },
    {
      label: "Routing",
      value: legs.length
        ? legs.map((l) => `${l.dep}-${l.des} ${l.carrier} ${l.flight}`).join(" · ")
        : null,
    },
    {
      label: "Issuing Agent",
      value: agentCity ? `DHL SameDay / Sky Courier, ${agentCity}` : null,
    },
    { label: "Part Number", value: capture(text, /\b(\d{4}-\d{4}-\d{4})\b/) },
    {
      label: "Vendor",
      value: normalizeVendorName(cleanValue(text.match(/Vendor:\s*\d*\s*([^\n]+)/i)?.[1] ?? null)),
    },
  ];
}

// Classify a PDF's extracted text as a DHL SameDay dispatch ticket and pull
// its fields, or return null if it doesn't look like one confidently enough.
export function classifyDhlSamedayTicket(text: string): DocumentMapping | null {
  const confidence = matchDhlSamedayTicket(text);
  if (confidence < MIN_CONFIDENCE) return null;

  return {
    type: "dhl-sameday-ticket",
    label: "DHL SameDay Dispatch Ticket",
    confidence: Math.round(confidence * 100) / 100,
    fields: extractDhlSamedayTicketFields(text),
  };
}
