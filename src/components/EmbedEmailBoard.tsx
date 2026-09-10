"use client";

import Script from "next/script";
import { useCallback, useRef, useState } from "react";
import type { MissiveEmail } from "@/lib/missive";

type LoadState = "loading-script" | "waiting" | "scanning" | "ready" | "not-ticket" | "error";
type SelectedConversationResponse = { email: MissiveEmail | null; error?: string };

type MissiveIframeConversation = {
  id: string;
  latest_message?: { id: string } | null;
  messages_count?: number;
};

type MissiveIframeApi = {
  on: (
    event: "change:conversations",
    callback: (ids: string[]) => void,
    options?: { retroactive?: boolean }
  ) => void;
  fetchConversations: (ids: string[]) => Promise<MissiveIframeConversation[]>;
};

declare global {
  interface Window {
    Missive?: MissiveIframeApi;
  }
}

function formatEmailDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function stateMessage(state: LoadState, message: string) {
  if (message) return message;
  if (state === "loading-script") return "Connecting to Missive...";
  if (state === "waiting") return "Open one email conversation in Missive.";
  if (state === "scanning") return "Scanning the selected email...";
  if (state === "not-ticket") return "No DHL SameDay ticket was found in the selected email.";
  if (state === "error") return "The selected email could not be processed.";
  return "";
}

// View-only Missive iframe: it reacts to the currently selected Missive
// conversation and only receives structured ticket data when the backend
// recognizes a DHL SameDay PDF attachment.
export function EmbedEmailBoard({ token }: { token: string }) {
  const [email, setEmail] = useState<MissiveEmail | null>(null);
  const [state, setState] = useState<LoadState>("loading-script");
  const [message, setMessage] = useState("");
  const [selectedConversationId, setSelectedConversationId] = useState("");
  const listenerRegisteredRef = useRef(false);
  const requestIdRef = useRef(0);

  const scanConversation = useCallback(
    async (conversationId: string) => {
      if (!token) {
        setEmail(null);
        setState("error");
        setMessage("This embed link is missing or no longer valid.");
        return;
      }

      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      setSelectedConversationId(conversationId);
      setEmail(null);
      setState("scanning");
      setMessage("");

      try {
        const response = await fetch(
          `/api/missive/conversations/${encodeURIComponent(conversationId)}?token=${encodeURIComponent(token)}`
        );
        const data = (await response.json().catch(() => ({}))) as Partial<SelectedConversationResponse>;
        if (requestId !== requestIdRef.current) return;

        if (!response.ok) {
          throw new Error(data.error ?? `status ${response.status}`);
        }

        if (!data.email?.ticketMapping) {
          setEmail(null);
          setState("not-ticket");
          return;
        }

        setEmail(data.email);
        setState("ready");
      } catch (error) {
        if (requestId !== requestIdRef.current) return;
        setEmail(null);
        setState("error");
        setMessage(
          error instanceof Error
            ? error.message
            : "Unable to scan the selected Missive conversation."
        );
      }
    },
    [token]
  );

  const handleConversationChange = useCallback(
    async (ids: string[]) => {
      if (ids.length !== 1) {
        requestIdRef.current += 1;
        setSelectedConversationId("");
        setEmail(null);
        setState("waiting");
        setMessage(ids.length > 1 ? "Select a single email conversation in Missive." : "");
        return;
      }

      const missive = window.Missive;
      let conversationId = ids[0];

      try {
        const [conversation] = (await missive?.fetchConversations(ids)) ?? [];
        if (conversation?.id) conversationId = conversation.id;
        if (conversation && conversation.messages_count === 0 && !conversation.latest_message) {
          requestIdRef.current += 1;
          setSelectedConversationId(conversationId);
          setEmail(null);
          setState("not-ticket");
          setMessage("The selected Missive conversation has no email message to scan.");
          return;
        }
      } catch {
        // The backend can still resolve the selected conversation id.
      }

      await scanConversation(conversationId);
    },
    [scanConversation]
  );

  const registerMissiveListener = useCallback(() => {
    if (listenerRegisteredRef.current) return;

    if (!window.Missive) {
      setState("error");
      setMessage("Open this page from a Missive iframe integration.");
      return;
    }

    listenerRegisteredRef.current = true;
    setState("waiting");

    try {
      window.Missive.on(
        "change:conversations",
        (ids) => {
          void handleConversationChange(ids);
        },
        { retroactive: true }
      );
    } catch {
      setState("error");
      setMessage("Missive did not expose the selected conversation to this iframe.");
    }
  }, [handleConversationChange]);

  const statusText = stateMessage(state, message);
  const attachments =
    email?.messageId && email.attachments?.length
      ? { messageId: email.messageId, attachments: email.attachments }
      : null;

  return (
    <>
      <Script
        src="https://integrations.missiveapp.com/missive.js"
        strategy="afterInteractive"
        onReady={registerMissiveListener}
        onError={() => {
          setState("error");
          setMessage("Missive's iframe library could not be loaded.");
        }}
      />

      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-zinc-950 dark:text-zinc-50">
              Selected Missive Email
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">{statusText}</p>
          </div>
          {selectedConversationId && (
            <button
              type="button"
              onClick={() => void scanConversation(selectedConversationId)}
              disabled={state === "scanning"}
              className="shrink-0 rounded-lg border border-black/[.08] px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-black/[.03] disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/[.1] dark:text-zinc-300 dark:hover:bg-white/[.05]"
            >
              {state === "scanning" ? "Scanning..." : "Rescan"}
            </button>
          )}
        </div>

        {email?.ticketMapping ? (
          <div className="flex flex-col gap-3 rounded-lg border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-[#0a0a0a]">
            <div className="flex flex-col gap-1">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <p className="text-sm font-medium text-zinc-950 dark:text-zinc-50">{email.subject}</p>
                <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                  {Math.round(email.ticketMapping.confidence * 100)}% match
                </span>
              </div>
              <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
                {email.from} - {formatEmailDate(email.receivedAt)}
              </p>
            </div>

            {attachments && (
              <div className="flex flex-wrap gap-2">
                {attachments.attachments.map((attachment) => (
                  <a
                    key={attachment.id}
                    href={`/api/missive/attachment?messageId=${encodeURIComponent(
                      attachments.messageId
                    )}&attachmentId=${encodeURIComponent(attachment.id)}&token=${encodeURIComponent(token)}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-black/[.08] px-3 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-black/[.03] dark:border-white/[.1] dark:text-zinc-300 dark:hover:bg-[#141414]"
                  >
                    Download {attachment.filename}
                  </a>
                ))}
              </div>
            )}

            <div className="flex flex-col gap-3">
              <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400">
                Extracted Data - {email.ticketMapping.label}
              </p>
              {email.ticketMapping.fields.map((field) => (
                <div key={field.label} className="flex flex-col gap-1">
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">{field.label}</span>
                  <p className="whitespace-pre-line text-sm text-zinc-900 dark:text-zinc-100">
                    {field.value ?? "Not found"}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-black/[.12] bg-white p-4 text-sm text-zinc-500 dark:border-white/[.16] dark:bg-[#0a0a0a] dark:text-zinc-400">
            {statusText}
          </div>
        )}
      </div>
    </>
  );
}
