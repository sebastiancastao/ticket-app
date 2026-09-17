// Recognizes AIT Worldwide Logistics "Delivery Order" documents — a freight
// forwarder that, like DHL SameDay (see dhl-sameday-ticket.ts), hands the
// last mile to a local courier via an emailed dispatch document, almost
// always a PDF attachment on a forwarded/replied email thread rather than
// the original message.
//
// Unlike the DHL SameDay ticket — ported from a source project that already
// knew its exact layout — this classifier is built from AIT's generic
// "Delivery Order" terminology and sending domain, not a real sample
// document. Treat the field extraction as a best-effort starting point:
// once a real AIT delivery order is on hand, tighten the regexes and
// confidence weights against it.

import type { DocumentMapping, MappedField } from "./dhl-sameday-ticket";
import { capture, flatten, valueAfter } from "./document-text";

const MIN_CONFIDENCE = 0.5;

// AIT's own sending domain (aitworldwide.com), or "AIT" spelled out next to
// "Worldwide"/"Logistics" in a display name, e.g.
// "AIT Worldwide Logistics <ops@aitworldwide.com>".
function isAitSender(fromAddress: string | undefined | null): boolean {
  if (!fromAddress) return false;
  return /@ait(worldwide)?\./i.test(fromAddress) || /\bait\b[^@]*worldwide/i.test(fromAddress);
}

function matchAitDeliveryOrder(text: string, fromAddress?: string | null): number {
  const flat = flatten(text).toLowerCase();
  let score = 0;

  // The company identifying itself in the document body.
  if (/\bait\b/.test(flat) && /(worldwide logistics|worldwide|logistics)/.test(flat)) score += 0.45;
  // The document's own title/heading.
  if (/\bdelivery\s*order\b/.test(flat)) score += 0.35;
  // A reference-style number (Order #, PRO#, BOL#, Shipment #) is present.
  if (/\b(order|pro|bol|shipment)\s*#\s*:?\s*\w+/.test(flat)) score += 0.1;
  // Sent from AIT's own domain — a strong signal even if the PDF text is
  // sparse (e.g. a scanned letterhead pdf-text.ts can barely read).
  if (isAitSender(fromAddress)) score += 0.25;

  return Math.min(score, 1);
}

function extractAitDeliveryOrderFields(text: string): MappedField[] {
  return [
    {
      label: "Order Number",
      value:
        capture(text, /Delivery\s*Order\s*#\s*:?\s*(\w[\w-]*)/i) ??
        capture(text, /Order\s*#\s*:?\s*(\w[\w-]*)/i),
    },
    { label: "Reference Number", value: capture(text, /(?:Reference|Ref)\s*#\s*:?\s*(\w[\w-]*)/i) },
    { label: "PRO Number", value: capture(text, /PRO\s*#\s*:?\s*(\w[\w-]*)/i) },
    { label: "BOL Number", value: capture(text, /BOL\s*#\s*:?\s*(\w[\w-]*)/i) },
    {
      label: "Shipper Name and Address",
      value: valueAfter(text, "Shipper") ?? valueAfter(text, "Pickup"),
    },
    {
      label: "Consignee Name and Address",
      value: valueAfter(text, "Consignee") ?? valueAfter(text, "Deliver\\s*To"),
    },
    { label: "Pieces", value: capture(text, /Pieces?\s*:?\s*(\d+)/i) },
    { label: "Gross Weight (lb)", value: capture(text, /Weight\s*:?\s*([\d,.]+)/i) },
    {
      label: "Delivery Date",
      value: valueAfter(text, "Delivery Date") ?? valueAfter(text, "Requested Delivery"),
    },
    {
      label: "Special Instructions",
      value: valueAfter(text, "Special Instructions") ?? valueAfter(text, "Delivery Instructions"),
    },
  ];
}

// Classify text (PDF attachment text, or an email body) as an AIT delivery
// order and pull its fields, or return null if it doesn't look like one
// confidently enough. `fromAddress` is the sending message's From address,
// when known — it boosts confidence when the sender itself is AIT, which
// matters because the delivery order often arrives a few messages back in a
// forwarded thread rather than on the message being classified.
export function classifyAitDeliveryOrder(text: string, fromAddress?: string | null): DocumentMapping | null {
  const confidence = matchAitDeliveryOrder(text, fromAddress);
  if (confidence < MIN_CONFIDENCE) return null;

  return {
    type: "ait-delivery-order",
    label: "AIT Delivery Order",
    confidence: Math.round(confidence * 100) / 100,
    fields: extractAitDeliveryOrderFields(text),
  };
}
