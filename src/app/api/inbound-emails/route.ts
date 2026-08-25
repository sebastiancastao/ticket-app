import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fetchInboundEmails } from "@/lib/inbound-emails";

export async function GET() {
  const supabase = await createClient();

  try {
    const emails = await fetchInboundEmails(supabase);
    return NextResponse.json({ emails });
  } catch (error) {
    console.error("Failed to fetch inbound emails:", error);
    return NextResponse.json({ error: "Failed to fetch inbound emails" }, { status: 502 });
  }
}
