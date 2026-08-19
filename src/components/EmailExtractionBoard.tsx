"use client";

import { useMemo, useState } from "react";
import { MOCK_EMAILS } from "@/lib/mock-emails";
import { extractShipmentData } from "@/lib/extract-shipment-data";
import type { TicketPriority } from "@/lib/tickets";

const PRIORITY_LABELS: Record<TicketPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

const PRIORITY_STYLES: Record<TicketPriority, string> = {
  low: "bg-zinc-100 text-zinc-700 dark:bg-zinc-500/10 dark:text-zinc-300",
  medium: "bg-blue-100 text-blue-800 dark:bg-blue-500/10 dark:text-blue-400",
  high: "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400",
};

type SubmitStatus = "idle" | "submitting" | "success";

function formatEmailDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function EmailExtractionBoard() {
  const [selectedId, setSelectedId] = useState(MOCK_EMAILS[0]?.id ?? "");
  const [status, setStatus] = useState<SubmitStatus>("idle");

  const selectedEmail = MOCK_EMAILS.find((email) => email.id === selectedId);
  const extracted = useMemo(
    () => (selectedEmail ? extractShipmentData(selectedEmail) : null),
    [selectedEmail]
  );

  function handleSelect(id: string) {
    setSelectedId(id);
    setStatus("idle");
  }

  function handleSubmit() {
    if (!extracted || status === "submitting") return;
    setStatus("submitting");
    // No real integration yet: simulates the round trip so the UI/UX can be
    // validated before the real Xcelerator endpoint exists.
    window.setTimeout(() => {
      setStatus("success");
      window.setTimeout(() => setStatus("idle"), 2500);
    }, 800);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Emails &amp; Data Extraction
        </h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Mock inbox on the left, shipment data extracted from the selected email on the right.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-3 rounded-xl border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-[#0a0a0a]">
          <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Emails (mock)</p>
          <ul className="flex flex-col gap-2">
            {MOCK_EMAILS.map((email) => {
              const isSelected = email.id === selectedId;
              return (
                <li key={email.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(email.id)}
                    aria-pressed={isSelected}
                    className={`w-full rounded-lg border p-3 text-left transition-colors ${
                      isSelected
                        ? "border-zinc-950 bg-zinc-50 dark:border-zinc-50 dark:bg-[#1a1a1a]"
                        : "border-black/[.08] hover:bg-black/[.03] dark:border-white/[.1] dark:hover:bg-[#141414]"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
                        {email.subject}
                      </span>
                      <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
                        {formatEmailDate(email.receivedAt)}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs text-zinc-500 dark:text-zinc-400">
                      {email.from}
                    </p>
                    <p className="mt-1 line-clamp-2 whitespace-pre-line text-xs text-zinc-600 dark:text-zinc-400">
                      {email.body}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-[#0a0a0a]">
          <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Extracted Data</p>
          {extracted ? (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <ExtractedField label="Customer" value={extracted.customerName} />
                <ExtractedField label="Phone" value={extracted.contactPhone} />
              </div>
              <ExtractedField label="Email" value={extracted.contactEmail} />
              <ExtractedField label="Pickup Address" value={extracted.pickupAddress} />
              <ExtractedField label="Delivery Address" value={extracted.deliveryAddress} />
              <div className="grid grid-cols-2 gap-3">
                <ExtractedField label="Requested Date" value={extracted.requestedDate} />
                <ExtractedField label="Service Type" value={extracted.serviceType} />
              </div>
              <ExtractedField label="Shipment / Inventory" value={extracted.itemsSummary} />
              <div className="flex flex-col gap-1">
                <span className="text-xs text-zinc-500 dark:text-zinc-400">Priority</span>
                <span
                  className={`w-fit rounded-full px-2.5 py-0.5 text-xs font-medium ${PRIORITY_STYLES[extracted.priority]}`}
                >
                  {PRIORITY_LABELS[extracted.priority]}
                </span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Select an email to see the extracted data.
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!extracted || status === "submitting"}
            className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-colors hover:bg-[#383838] disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-[#ccc]"
          >
            {status === "submitting" ? "Submitting…" : "Submit to Xcelerator"}
          </button>
          {status === "success" && (
            <span className="text-sm text-emerald-600 dark:text-emerald-400">
              Submitted (simulated) ✓
            </span>
          )}
        </div>
        <p className="text-xs text-zinc-400 dark:text-zinc-500">
          Xcelerator integration pending: this button doesn&apos;t call any real service yet.
        </p>
      </div>
    </div>
  );
}

function ExtractedField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-zinc-500 dark:text-zinc-400">{label}</span>
      <p className="text-sm text-zinc-900 dark:text-zinc-100">{value}</p>
    </div>
  );
}
