import { NextResponse, type NextRequest } from "next/server";
import { hasConfiguredEmbedToken, isConfiguredEmbedTokenValid } from "@/lib/embed-tokens";
import { fetchMissiveConversationEmail } from "@/lib/missive";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const token = request.nextUrl.searchParams.get("token") ?? "";

  try {
    if (!token.trim()) {
      return NextResponse.json({ error: "Invalid embed token" }, { status: 401 });
    }

    if (hasConfiguredEmbedToken() && !isConfiguredEmbedTokenValid(token)) {
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
