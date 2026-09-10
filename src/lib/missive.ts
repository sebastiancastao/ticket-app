import type { MockEmail } from "@/lib/mock-emails";
import { extractPdfText } from "@/lib/pdf-text";
import { classifyDhlSamedayTicket, type DocumentMapping } from "@/lib/dhl-sameday-ticket";
import { extractUuid } from "@/lib/missive-id";

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
    throw new Error(`Missive request failed ${path} (${response.status}): ${bodyText}`);
  }
  throw new Error("Missive request failed: exhausted retries");
}

type MissiveAddress = { name: string; address: string };

type MissiveConversation = {
  id: string;
  subject?: string | null;
  latest_message_subject?: string | null;
  external_authors?: MissiveAddress[];
  authors?: MissiveAddress[];
  last_activity_at?: number;
  messages_count?: number;
};

type MissiveMessageSummary = { id: string; delivered_at?: number | null };

type MissiveAttachment = {
  id: string;
  filename: string;
  extension?: string | null;
  url: string;
  media_type?: string | null;
  sub_type?: string | null;
};

type MissiveMessage = {
  id: string;
  subject: string | null;
  body: string | null;
  delivered_at: number | null;
  from_field: MissiveAddress | null;
  attachments?: MissiveAttachment[];
};

async function fetchMissiveMessages(ids: string[]): Promise<MissiveMessage[]> {
  if (ids.length === 0) return [];

  const path = `/messages/${ids.map(encodeURIComponent).join(",")}`;
  const { messages } = await missiveGet<{ messages: MissiveMessage | MissiveMessage[] }>(path, {});
  return Array.isArray(messages) ? messages : [messages];
}

async function fetchMissiveMessage(id: string): Promise<MissiveMessage> {
  const [message] = await fetchMissiveMessages([id]);
  if (!message) throw new Error(`Missive message ${id} was not found.`);
  return message;
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

function pdfAttachments(message: MissiveMessage): MissiveAttachment[] {
  return (message.attachments ?? []).filter((attachment) => {
    const extension = attachment.extension?.toLowerCase();
    const subType = attachment.sub_type?.toLowerCase();
    return extension === "pdf" || subType === "pdf" || attachment.filename.toLowerCase().endsWith(".pdf");
  });
}

async function classifyMessageTicket(
  message: MissiveMessage,
  attachments: MissiveAttachment[]
): Promise<DocumentMapping | null> {
  const attachmentMapping = await classifyAttachments(attachments);
  if (attachmentMapping) return attachmentMapping;

  const rawBody = message.body ?? "";
  const body = looksLikeHtml(rawBody) ? stripHtml(rawBody) : rawBody;
  return classifyDhlSamedayTicket(body);
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

function buildMissiveEmail(
  conversation: MissiveConversation,
  message: MissiveMessage,
  attachments: MissiveAttachment[],
  ticketMapping: DocumentMapping | null
): MissiveEmail {
  const from =
    message.from_field?.address ??
    conversation.external_authors?.[0]?.address ??
    conversation.authors?.[0]?.address ??
    "unknown@unknown";
  const rawBody = message.body ?? "";

  return {
    id: conversation.id,
    from,
    subject: message.subject ?? conversation.latest_message_subject ?? conversation.subject ?? "(no subject)",
    receivedAt: new Date(
      (message.delivered_at ?? conversation.last_activity_at ?? Date.now() / 1000) * 1000
    ).toISOString(),
    body: looksLikeHtml(rawBody) ? stripHtml(rawBody) : rawBody,
    messageId: message.id,
    attachments: attachments.map((a) => ({ id: a.id, filename: a.filename })),
    ...(ticketMapping ? { ticketMapping } : {}),
  };
}

async function fetchLatestMissiveEmail(conversation: MissiveConversation): Promise<MissiveEmail | null> {
  const conversationId = extractUuid(conversation.id);
  if (!conversationId || conversation.messages_count === 0) return null;

  // Missive rejects limit < 2 on this endpoint even though we only want
  // the single latest message (returned first / newest-first).
  const { messages } = await missiveGet<{ messages: MissiveMessageSummary[] }>(
    `/conversations/${conversationId}/messages`,
    { limit: "2" }
  );
  const latest = messages[0];
  if (!latest) return null;

  const message = await fetchMissiveMessage(latest.id);
  const attachments = pdfAttachments(message);
  const ticketMapping = await classifyMessageTicket(message, attachments);

  return buildMissiveEmail({ ...conversation, id: conversationId }, message, attachments, ticketMapping);
}

async function fetchConversationMessageSummaries(
  conversationId: string,
  maxMessages = 20
): Promise<MissiveMessageSummary[]> {
  const normalizedConversationId = extractUuid(conversationId);
  if (!normalizedConversationId) {
    throw new Error("Internal Missive conversation id did not contain a UUID.");
  }

  const summaries: MissiveMessageSummary[] = [];
  const seen = new Set<string>();
  let until: number | undefined;

  while (summaries.length < maxMessages) {
    const params: Record<string, string> = { limit: "10" };
    if (until !== undefined) params.until = String(until);

    const { messages } = await missiveGet<{ messages: MissiveMessageSummary[] }>(
      `/conversations/${normalizedConversationId}/messages`,
      params
    );
    if (messages.length === 0) break;

    for (const message of messages) {
      if (summaries.length >= maxMessages) break;
      if (!seen.has(message.id)) {
        seen.add(message.id);
        summaries.push(message);
      }
    }

    const oldest = messages[messages.length - 1]?.delivered_at;
    if (messages.length < 10 || typeof oldest !== "number") break;

    until = oldest - 1;
  }

  return summaries;
}

async function fetchFullConversationMessages(summaries: MissiveMessageSummary[]): Promise<MissiveMessage[]> {
  const ids = summaries.map((message) => message.id);
  const messages: MissiveMessage[] = [];

  for (let start = 0; start < ids.length; start += 10) {
    messages.push(...(await fetchMissiveMessages(ids.slice(start, start + 10))));
  }

  const byId = new Map(messages.map((message) => [message.id, message]));
  return ids.map((id) => byId.get(id)).filter((message): message is MissiveMessage => Boolean(message));
}

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
    const email = await fetchLatestMissiveEmail(conversation);
    if (email) emails.push(email);
  }

  return emails;
}

export async function fetchMissiveConversationEmail(conversationId: string): Promise<MissiveEmail | null> {
  const normalizedConversationId = extractUuid(conversationId);
  if (!normalizedConversationId) {
    throw new Error("Selected Missive conversation id did not contain a UUID.");
  }

  const { conversations } = await missiveGet<{
    conversations: MissiveConversation | MissiveConversation[];
  }>(
    `/conversations/${normalizedConversationId}`,
    {}
  );
  const conversationResult = Array.isArray(conversations) ? conversations[0] : conversations;
  if (!conversationResult) return null;

  const resolvedConversationId = extractUuid(conversationResult.id) ?? normalizedConversationId;
  const conversation = { ...conversationResult, id: resolvedConversationId };

  if (conversation.messages_count === 0) return null;

  const summaries = await fetchConversationMessageSummaries(resolvedConversationId);
  const messages = await fetchFullConversationMessages(summaries);

  for (const message of messages) {
    const attachments = pdfAttachments(message);
    const ticketMapping = await classifyMessageTicket(message, attachments);
    if (ticketMapping) {
      return buildMissiveEmail(conversation, message, attachments, ticketMapping);
    }
  }

  return null;
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
