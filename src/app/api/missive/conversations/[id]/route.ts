import { NextResponse, type NextRequest } from "next/server";
import { isEmbedTokenValid } from "@/lib/embed-tokens";
import { fetchMissiveConversationEmail } from "@/lib/missive";
import { createClient } from "@/lib/supabase/server";

function canBypassSupabaseEmbedValidation(token: string, error: unknown): boolean {
  if (process.env.NODE_ENV === "production") return false;
  if (!token.trim()) return false;

  console.warn(
    "Supabase embed token validation failed; allowing the non-empty token in development only.",
    error
  );
  return true;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.nextUrl.searchParams.get("token") ?? "";

  try {
    const supabase = await createClient();
    let validToken = false;

    try {
      validToken = await isEmbedTokenValid(supabase, token);
    } catch (error) {
      if (!canBypassSupabaseEmbedValidation(token, error)) throw error;
      validToken = true;
    }

    if (!validToken) {
      return NextResponse.json({ error: "Invalid embed token" }, { status: 401 });
    }

    const { id } = await params;
    const email = await fetchMissiveConversationEmail(id);

    return NextResponse.json({ email: email?.ticketMapping ? email : null });
  } catch (error) {
    console.error("Failed to fetch selected Missive conversation:", error);
    const message =
      error instanceof Error ? error.message : "Failed to fetch selected Missive conversation";

    return NextResponse.json(
      { error: message },
      { status: 502 }
    );
  }
}
