import { randomBytes, createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type EmbedToken = {
  id: string;
  label: string | null;
  createdAt: string;
  revokedAt: string | null;
};

// Creates a new token, returning the raw value once — only its hash is
// persisted, so this is the only time the caller can see it.
export async function createEmbedToken(
  supabase: SupabaseClient,
  label: string | null
): Promise<{ token: string; record: EmbedToken }> {
  const token = randomBytes(32).toString("base64url");
  const { data, error } = await supabase
    .from("embed_tokens")
    .insert({ token_hash: hashToken(token), label })
    .select("id, label, created_at, revoked_at")
    .single();

  if (error) throw new Error(`Failed to create embed token: ${error.message}`);

  return {
    token,
    record: { id: data.id, label: data.label, createdAt: data.created_at, revokedAt: data.revoked_at },
  };
}

export async function listEmbedTokens(supabase: SupabaseClient): Promise<EmbedToken[]> {
  const { data, error } = await supabase
    .from("embed_tokens")
    .select("id, label, created_at, revoked_at")
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Failed to list embed tokens: ${error.message}`);

  return data.map((row) => ({
    id: row.id,
    label: row.label,
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
  }));
}

export async function revokeEmbedToken(supabase: SupabaseClient, id: string): Promise<void> {
  const { error } = await supabase
    .from("embed_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw new Error(`Failed to revoke embed token: ${error.message}`);
}
