import type { SupabaseClient } from "@supabase/supabase-js";
import type { MockEmail } from "@/lib/mock-emails";

// Rows land in this table via the n8n workflow's ingest POST (n8n owns the
// actual mailbox connection); this just reads what's already there.
export type InboundEmail = MockEmail;

type InboundEmailRow = {
  id: string;
  from_address: string;
  subject: string;
  body: string;
  received_at: string;
  is_read: boolean;
};

export async function fetchInboundEmails(
  supabase: SupabaseClient,
  limit = 15
): Promise<InboundEmail[]> {
  const { data, error } = await supabase
    .from("inbound_emails")
    .select("id, from_address, subject, body, received_at, is_read")
    .order("received_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to query inbound_emails: ${error.message}`);
  }

  return (data as InboundEmailRow[]).map((row) => ({
    id: row.id,
    from: row.from_address,
    subject: row.subject,
    receivedAt: row.received_at,
    body: row.body,
  }));
}
