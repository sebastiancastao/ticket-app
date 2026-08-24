import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchMissiveEmails } from "@/lib/missive";

// Requires an authenticated session: this endpoint surfaces real customer
// emails (names, phone numbers, addresses), and the board that calls it
// sits on the /tickets page, which the proxy already gates — this check is
// a second layer in case that ever changes.
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const emails = await fetchMissiveEmails();
    return NextResponse.json({ emails });
  } catch (error) {
    console.error("Failed to fetch Missive emails:", error);
    return NextResponse.json({ error: "Failed to fetch Missive emails" }, { status: 502 });
  }
}
