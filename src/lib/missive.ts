import type { MockEmail } from "@/lib/mock-emails";
import { extractPdfText } from "@/lib/pdf-text";
import { classifyDhlSamedayTicket, type DocumentMapping } from "@/lib/dhl-sameday-ticket";

const API_BASE = "https://public.missiveapp.com/v1";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name} — set it in .env.local.`);
  }
  return value;
}

function authHeaders(): HeadersInit {
  return { Authorization: `Bearer ${requireEnv("MISSIVE_API_TOKEN")}` };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function missiveGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const url = new URL(`${API_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetch(url, { headers: authHeaders(), cache: "no-store" });
    if (response.ok) {
      return response.json() as Promise<T>;
    }

    const bodyText = await response.text();
    if (response.status === 429 && attempt === 0) {
      const retryAfter = Number(JSON.parse(bodyText)?.error?.params?.retry_after) || 2;
      await sleep(retryAfter * 1000);
      continue;
    }
    throw new Error(`Missive request failed (${response.status}): ${bodyText}`);
  }
  throw new Error("Missive request failed: exhausted retries");
}

type MissiveAddress = { name: string; address: string };

type MissiveConversation = {
  id: string;
  latest_message_subject: string | null;
  external_authors: MissiveAddress[];
  authors: MissiveAddress[];
  last_activity_at: number;
  messages_count: number;
};

type MissiveMessageSummary = { id: string };

type MissiveAttachment = {
  id: string;
  filename: string;
  extension: string;
  url: string;
  media_type: string;
  sub_type: string;
};

type MissiveMessage = {
  id: string;
  subject: string | null;
  body: string | null;
  delivered_at: number | null;
  from_field: MissiveAddress | null;
  attachments: MissiveAttachment[];
};

// GET /v1/messages/:id wraps its result as { messages: {...} } — a single
// object under the plural key, unlike every other endpoint here where
// "messages"/"conversations" holds an array. Missed this the first time
// around: message.subject/from_field/delivered_at all have conversation-
// level fallbacks that happened to look right anyway, but attachments
// doesn't, so PDFs were silently never being found.
async function fetchMissiveMessage(id: string): Promise<MissiveMessage> {
  const { messages } = await missiveGet<{ messages: MissiveMessage }>(`/messages/${id}`, {});
  return messages;
}

function looksLikeHtml(value: string): boolean {
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

// Downloads each PDF attachment (Missive's attachment URLs are pre-signed,
// no auth header needed) and runs it through the DHL SameDay ticket
// classifier, keeping the highest-confidence match across all of them. A
// message usually carries at most one relevant PDF, but this doesn't assume
// that — e.g. a forwarded chain could have more than one attached.
async function classifyAttachments(
  attachments: MissiveAttachment[]
): Promise<DocumentMapping | null> {
  let best: DocumentMapping | null = null;

  for (const attachment of attachments) {
    if (attachment.extension.toLowerCase() !== "pdf") continue;

    try {
      const response = await fetch(attachment.url);
      if (!response.ok) continue;
      const bytes = new Uint8Array(await response.arrayBuffer());
      const text = await extractPdfText(bytes);
      const mapping = classifyDhlSamedayTicket(text);
      if (mapping && (!best || mapping.confidence > best.confidence)) {
        best = mapping;
      }
    } catch (err) {
      console.error(`Failed to classify attachment "${attachment.filename}":`, err);
    }
  }

  return best;
}

// Missive's public API has no read/unread concept: it's a shared team
// inbox, and workflow state is tracked via assigned/closed/archived
// per-user rather than a single read flag. There's nothing honest to map
// here, so this always comes back unread rather than faking a value.
export type MissiveEmail = MockEmail & {
  /** Structured fields pulled from a DHL SameDay ticket PDF attachment, if any was found and matched. */
  ticketMapping?: DocumentMapping;
  /** The underlying message id (distinct from `id`, which is the conversation id) — needed to re-fetch a fresh attachment URL on download, since Missive's URLs are pre-signed and expire. */
  messageId?: string;
  /** PDF attachments on the message, for the "download the original PDF" link. */
  attachments?: { id: string; filename: string }[];
};

export async function fetchMissiveEmails(limit = 15): Promise<MissiveEmail[]> {
  // Which mailbox to read: inbox, all, assigned, closed, snoozed, flagged,
  // trashed, junked, or drafts (Missive requires exactly one such scope).
  const scope = process.env.MISSIVE_MAILBOX_SCOPE || "inbox";

  const { conversations } = await missiveGet<{ conversations: MissiveConversation[] }>(
    "/conversations",
    { [scope]: "true", limit: String(limit) }
  );

  // Sequential on purpose: each conversation needs 2 follow-up requests,
  // and firing all of them concurrently (Promise.all) bursts past Missive's
  // rate limit and every request comes back 429.
  const emails: MissiveEmail[] = [];
  for (const conversation of conversations) {
    if (conversation.messages_count === 0) continue;

    // Missive rejects limit < 2 on this endpoint even though we only want
    // the single latest message (returned first / newest-first).
    const { messages } = await missiveGet<{ messages: MissiveMessageSummary[] }>(
      `/conversations/${conversation.id}/messages`,
      { limit: "2" }
    );
    const latest = messages[0];
    if (!latest) continue;

    const message = await fetchMissiveMessage(latest.id);

    const from =
      message.from_field?.address ??
      conversation.external_authors[0]?.address ??
      conversation.authors[0]?.address ??
      "unknown@unknown";
    const rawBody = message.body ?? "";
    const pdfAttachments = (message.attachments ?? []).filter(
      (a) => a.extension.toLowerCase() === "pdf"
    );
    const ticketMapping = await classifyAttachments(pdfAttachments);

    emails.push({
      id: conversation.id,
      from,
      subject: message.subject ?? conversation.latest_message_subject ?? "(no subject)",
      receivedAt: new Date(
        (message.delivered_at ?? conversation.last_activity_at) * 1000
      ).toISOString(),
      body: looksLikeHtml(rawBody) ? stripHtml(rawBody) : rawBody,
      messageId: message.id,
      attachments: pdfAttachments.map((a) => ({ id: a.id, filename: a.filename })),
      ...(ticketMapping ? { ticketMapping } : {}),
    });
  }

  return emails;
}

// Re-fetches the message to get a fresh, unexpired signed URL for one of its
// attachments — the URLs on MissiveEmail.attachments came from whenever
// fetchMissiveEmails last ran and may have since expired.
export async function fetchMissiveAttachment(
  messageId: string,
  attachmentId: string
): Promise<{ url: string; filename: string } | null> {
  const message = await fetchMissiveMessage(messageId);
  const attachment = message.attachments?.find((a) => a.id === attachmentId);
  return attachment ? { url: attachment.url, filename: attachment.filename } : null;
}
