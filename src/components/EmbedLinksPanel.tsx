"use client";

import { useEffect, useState } from "react";
import type { EmbedToken } from "@/lib/embed-tokens";

function embedUrl(token: string): string {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/embed/tickets?token=${token}`;
}

export function EmbedLinksPanel() {
  const [tokens, setTokens] = useState<EmbedToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [justCreated, setJustCreated] = useState<{ id: string; url: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function refresh() {
    const response = await fetch("/api/embed-tokens");
    if (response.ok) {
      const data = (await response.json()) as { tokens: EmbedToken[] };
      setTokens(data.tokens);
    }
  }

  useEffect(() => {
    async function load() {
      await refresh();
      setLoading(false);
    }
    load();
  }, []);

  async function handleCreate() {
    const response = await fetch("/api/embed-tokens", { method: "POST" });
    if (!response.ok) return;
    const data = (await response.json()) as { token: string; record: EmbedToken };
    setJustCreated({ id: data.record.id, url: embedUrl(data.token) });
    setCopied(false);
    await refresh();
  }

  async function handleRevoke(id: string) {
    await fetch(`/api/embed-tokens/${id}/revoke`, { method: "POST" });
    if (justCreated?.id === id) setJustCreated(null);
    await refresh();
  }

  async function handleCopy() {
    if (!justCreated) return;
    await navigator.clipboard.writeText(justCreated.url);
    setCopied(true);
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-black/[.08] bg-white p-4 dark:border-white/[.145] dark:bg-[#0a0a0a]">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-zinc-950 dark:text-zinc-50">Embed links</p>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            View-only — can&apos;t submit to Xcelerator. No expiry; revoke to disable.
          </p>
        </div>
        <button
          type="button"
          onClick={handleCreate}
          className="shrink-0 rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
        >
          Generate link
        </button>
      </div>

      {justCreated && (
        <div className="flex flex-col gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 dark:border-emerald-500/20 dark:bg-emerald-500/10">
          <p className="text-xs text-emerald-800 dark:text-emerald-300">
            Copy this now — it won&apos;t be shown again.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 overflow-x-auto whitespace-nowrap rounded bg-white px-2 py-1 text-xs text-zinc-800 dark:bg-black/30 dark:text-zinc-200">
              {justCreated.url}
            </code>
            <button
              type="button"
              onClick={handleCopy}
              className="shrink-0 rounded-full border border-black/[.08] px-3 py-1 text-xs font-medium transition-colors hover:bg-black/[.03] dark:border-white/[.1] dark:hover:bg-white/[.05]"
            >
              {copied ? "Copied ✓" : "Copy"}
            </button>
          </div>
        </div>
      )}

      {!loading && tokens.length > 0 && (
        <ul className="flex flex-col divide-y divide-black/[.08] text-sm dark:divide-white/[.1]">
          {tokens.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-2 py-2">
              <span className={t.revokedAt ? "text-zinc-400 line-through dark:text-zinc-600" : "text-zinc-700 dark:text-zinc-300"}>
                {t.label || "Untitled"} · created {new Date(t.createdAt).toLocaleDateString()}
                {t.revokedAt ? " · revoked" : ""}
              </span>
              {!t.revokedAt && (
                <button
                  type="button"
                  onClick={() => handleRevoke(t.id)}
                  className="shrink-0 text-xs font-medium text-red-600 hover:underline dark:text-red-400"
                >
                  Revoke
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
