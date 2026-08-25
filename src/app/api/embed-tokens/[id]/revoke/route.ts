import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { revokeEmbedToken } from "@/lib/embed-tokens";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { id } = await params;

  try {
    await revokeEmbedToken(supabase, id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Failed to revoke embed token:", error);
    return NextResponse.json({ error: "Failed to revoke embed token" }, { status: 500 });
  }
}
