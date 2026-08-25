import { NextResponse } from "next/server";
import { fetchMissiveEmails } from "@/lib/missive";

export async function GET() {
  try {
    const emails = await fetchMissiveEmails();
    return NextResponse.json({ emails });
  } catch (error) {
    console.error("Failed to fetch Missive emails:", error);
    return NextResponse.json({ error: "Failed to fetch Missive emails" }, { status: 502 });
  }
}
