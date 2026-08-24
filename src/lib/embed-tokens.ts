import { randomBytes, createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";

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
  userId: string,
  label: string | null
): Promise<{ token: string; record: EmbedToken }> {
  const token = randomBytes(32).toString("base64url");
  const { data, error } = await supabase
    .from("embed_tokens")
    .insert({ token_hash: hashToken(token), label, created_by: userId })
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

// Validates a raw token from an embed request via the is_embed_token_valid
// RPC (security definer), so this works with the anon key alone — no
// service-role key needed, and the table itself stays inaccessible to anon.
export async function isEmbedTokenValid(supabase: SupabaseClient, rawToken: string): Promise<boolean> {
  if (!rawToken) return false;
  const { data, error } = await supabase.rpc("is_embed_token_valid", {
    check_token_hash: hashToken(rawToken),
  });
  if (error) {
    console.error("Failed to validate embed token:", error);
    return false;
  }
  return data === true;
}

// Shared gate for routes reachable both from the signed-in main app (session
// cookie) and the view-only /embed/tickets page (?token= query param, since
// cookies don't survive a cross-domain iframe). Session takes precedence.
export async function isAuthorizedForData(
  supabase: SupabaseClient,
  request: NextRequest
): Promise<boolean> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) return true;

  const token = request.nextUrl.searchParams.get("token");
  return token ? isEmbedTokenValid(supabase, token) : false;
}
