import { NextResponse, type NextRequest } from "next/server";
import { fetchMissiveAttachment } from "@/lib/missive";

// Streams a PDF attachment back to the browser as a download.
export async function GET(request: NextRequest) {
  const messageId = request.nextUrl.searchParams.get("messageId");
  const attachmentId = request.nextUrl.searchParams.get("attachmentId");
  if (!messageId || !attachmentId) {
    return NextResponse.json({ error: "Missing messageId or attachmentId" }, { status: 400 });
  }

  try {
    const attachment = await fetchMissiveAttachment(messageId, attachmentId);
    if (!attachment) {
      return NextResponse.json({ error: "Attachment not found" }, { status: 404 });
    }

    const pdfResponse = await fetch(attachment.url);
    if (!pdfResponse.ok || !pdfResponse.body) {
      throw new Error(`Attachment download failed (${pdfResponse.status})`);
    }

    return new NextResponse(pdfResponse.body, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${attachment.filename.replace(/"/g, "")}"`,
      },
    });
  } catch (error) {
    console.error("Failed to download Missive attachment:", error);
    return NextResponse.json({ error: "Failed to download attachment" }, { status: 502 });
  }
}
