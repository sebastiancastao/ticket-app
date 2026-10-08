import { NextResponse, type NextRequest } from "next/server";
import { axisConfigFromEnv, AxisError, uploadOrderDocuments } from "@/lib/axis";
import { readOrderDocuments } from "@/lib/order-documents";

// Logs into the Axis ClientPortal from the server, so force the Node.js runtime.
export const runtime = "nodejs";

// Attaches extra documents to an order that already exists in Axis: files
// added after the order was submitted, or a retry of ones that failed then.
// Multipart body: "orderTrackingId" plus one or more "documents" files.
// Unauthenticated, like /api/axis-submit, and writes to the production portal.
export async function POST(request: NextRequest) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected a multipart/form-data body." }, { status: 400 });
  }

  const orderTrackingId = String(form.get("orderTrackingId") ?? "").trim();
  // Axis tracking ids look like "76.082426".
  if (!/^\d{1,12}(\.\d{1,8})?$/.test(orderTrackingId)) {
    return NextResponse.json({ error: "A valid orderTrackingId is required." }, { status: 400 });
  }

  const read = await readOrderDocuments(form);
  if ("error" in read) {
    return NextResponse.json({ error: read.error }, { status: 400 });
  }
  if (read.documents.length === 0) {
    return NextResponse.json({ error: "No documents provided." }, { status: 400 });
  }

  const cfg = axisConfigFromEnv();
  if (!(cfg.username && cfg.password)) {
    return NextResponse.json({ error: "Axis is not configured. Set: AXIS_USERNAME + AXIS_PASSWORD." }, { status: 400 });
  }

  try {
    const documents = await uploadOrderDocuments(orderTrackingId, read.documents, cfg);
    return NextResponse.json({ ok: documents.every((d) => d.ok), orderTrackingId, documents });
  } catch (err) {
    const status = err instanceof AxisError && err.status ? err.status : 502;
    console.error("Axis document upload failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to upload documents to Axis." },
      { status }
    );
  }
}
