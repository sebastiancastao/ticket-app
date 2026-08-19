import type { TicketPriority } from "@/lib/tickets";
import type { MockEmail } from "@/lib/mock-emails";

export type ExtractedShipmentData = {
  customerName: string;
  contactEmail: string;
  contactPhone: string;
  pickupAddress: string;
  deliveryAddress: string;
  requestedDate: string;
  serviceType: string;
  itemsSummary: string;
  priority: TicketPriority;
};

const HIGH_PRIORITY_KEYWORDS = [
  "urgent",
  "asap",
  "as soon as possible",
  "immediately",
  "time-critical",
  "time-sensitive",
  "deadline",
];
const LOW_PRIORITY_KEYWORDS = ["no rush", "flexible", "whenever", "not urgent"];

function extractField(body: string, ...labels: string[]): string | undefined {
  for (const label of labels) {
    const match = body.match(new RegExp(`${label}\\s*:\\s*(.+)`, "i"));
    if (match?.[1]) return match[1].trim();
  }
  return undefined;
}

function derivePriority(text: string): TicketPriority {
  const haystack = text.toLowerCase();
  if (HIGH_PRIORITY_KEYWORDS.some((keyword) => haystack.includes(keyword))) return "high";
  if (LOW_PRIORITY_KEYWORDS.some((keyword) => haystack.includes(keyword))) return "low";
  return "medium";
}

// Simulated extraction: pulls the fields a moving/courier company's intake
// process usually needs (contact info, pickup/delivery, requested date,
// service type, shipment details) out of the email body. Replace with a
// real extractor (NLP/LLM) once one exists.
export function extractShipmentData(email: MockEmail): ExtractedShipmentData {
  const { body } = email;

  return {
    customerName: extractField(body, "Name") ?? "Not provided",
    contactEmail: email.from,
    contactPhone: extractField(body, "Phone") ?? "Not provided",
    pickupAddress: extractField(body, "Pickup Address", "Origin") ?? "Not specified",
    deliveryAddress: extractField(body, "Delivery Address", "Destination") ?? "Not specified",
    requestedDate:
      extractField(body, "Preferred Move Date", "Preferred Pickup Date", "Preferred Date") ??
      "Not specified",
    serviceType: extractField(body, "Service Type") ?? "Not specified",
    itemsSummary: extractField(body, "Inventory", "Items") ?? "Not specified",
    priority: derivePriority(`${email.subject} ${body}`),
  };
}
