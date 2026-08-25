import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createEmbedToken, listEmbedTokens } from "@/lib/embed-tokens";

export async function GET() {
  const supabase = await createClient();
  try {
    const tokens = await listEmbedTokens(supabase);
    return NextResponse.json({ tokens });
  } catch (error) {
    console.error("Failed to list embed tokens:", error);
    return NextResponse.json({ error: "Failed to list embed tokens" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const body = await request.json().catch(() => ({}));
  const label = typeof body.label === "string" && body.label.trim() ? body.label.trim() : null;

  try {
    const { token, record } = await createEmbedToken(supabase, label);
    // The raw token is only ever returned here — it isn't stored, so this
    // response is the one chance the caller has to see/copy it.
    return NextResponse.json({ token, record });
  } catch (error) {
    console.error("Failed to create embed token:", error);
    return NextResponse.json({ error: "Failed to create embed token" }, { status: 500 });
  }
}
