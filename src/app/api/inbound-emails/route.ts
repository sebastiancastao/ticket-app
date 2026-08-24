import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchInboundEmails } from "@/lib/inbound-emails";

// Requires an authenticated session: this endpoint surfaces real customer
// emails (names, phone numbers, addresses), and the board that calls it
// sits on the /tickets page, which the proxy already gates — this check is
// a second layer in case that ever changes. The same session-scoped client
// is reused for the query itself, so the RLS "authenticated can read
// inbound emails" policy on the table applies rather than any elevated key.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const emails = await fetchInboundEmails(supabase);
    return NextResponse.json({ emails });
  } catch (error) {
    console.error("Failed to fetch inbound emails:", error);
    return NextResponse.json({ error: "Failed to fetch inbound emails" }, { status: 502 });
  }
}
