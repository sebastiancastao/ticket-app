// Ported verbatim from skyline-xcelerator's src/lib/order-log.ts.
//
// Persistent log of orders this app has submitted to Axis.
//
// The portal's order-listing grid endpoint (trackingOnline/getorders) can't be
// driven reliably from outside the browser, so rather than read the whole
// account back, we keep our own durable audit trail: every order submitted
// through /api/axis-submit is appended here with a timestamp.
//
// Server-only (uses the filesystem).

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export type LoggedOrder = {
  /** Portal OrderTrackingID returned by SubmitOrder. */
  orderTrackingId: string;
  /** ISO timestamp of submission. */
  submittedAt: string;
  accountNo?: string;
  serviceId?: number;
  vehicleId?: number;
  clientRefNo?: string;
  clientRefNo2?: string;
  /** Pickup company/name. */
  pickup?: string;
  /** Delivery company/name. */
  delivery?: string;
  specInstr?: string;
  /** Source email id, when known. */
  sourceEmailId?: string;
};

// Stored under the project root so it persists across dev restarts. Kept out of
// git via .gitignore.
const LOG_PATH = join(process.cwd(), "data", "axis-orders.json");

async function readAll(): Promise<LoggedOrder[]> {
  try {
    const raw = await readFile(LOG_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as LoggedOrder[]) : [];
  } catch {
    // Missing or corrupt file — start fresh.
    return [];
  }
}

/** Append entries to the log, newest data preserved. Best-effort; never throws. */
export async function appendLoggedOrders(entries: LoggedOrder[]): Promise<void> {
  if (entries.length === 0) return;
  try {
    const existing = await readAll();
    existing.push(...entries);
    await mkdir(dirname(LOG_PATH), { recursive: true });
    await writeFile(LOG_PATH, JSON.stringify(existing, null, 2), "utf8");
  } catch (err) {
    // Logging must not break order submission.
    console.error("Failed to write order log:", err);
  }
}

/** All logged orders, newest first. */
export async function getLoggedOrders(): Promise<LoggedOrder[]> {
  const all = await readAll();
  return all.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
}
