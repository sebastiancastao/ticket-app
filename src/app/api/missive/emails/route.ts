import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchMissiveEmails } from "@/lib/missive";
import { isAuthorizedForData } from "@/lib/embed-tokens";

// Requires either an authenticated session (the main /tickets board) or a
// valid ?token= (the view-only /embed/tickets page) — both surface real
// customer emails, so neither is optional.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  if (!(await isAuthorizedForData(supabase, request))) {
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
