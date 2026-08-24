import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { DocumentMapping } from "@/lib/dhl-sameday-ticket";
import { axisConfigFromEnv, AxisError, resolveServiceId, resolveVehicleId, submitOrders } from "@/lib/axis";
import { AXIS_SUBMITTABLE_TYPES, mappingToAxisOrder, type AxisOrderDefaults } from "@/lib/axis-map";
import { appendLoggedOrders, type LoggedOrder } from "@/lib/order-log";

// Talks to the Axis ClientPortal over the network from the server (keeps
// credentials off the client), so force the Node.js runtime.
export const runtime = "nodejs";

// A successful (non-dryRun) submit creates a REAL dispatch order in Skyline's
// production system — there is no sandbox. Signed-in only, same as the other
// routes that touch real customer/shipment data.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let mapping: DocumentMapping;
  let sourceEmailId: string | undefined;
  let dryRun = false;
  let mode: "air-tender" | "normal" = "air-tender";
  try {
    const body = await request.json();
    if (!body.mapping) {
      return NextResponse.json({ error: "No document mapping provided." }, { status: 400 });
    }
    mapping = body.mapping;
    sourceEmailId = typeof body.sourceEmailId === "string" ? body.sourceEmailId : undefined;
    dryRun = body.dryRun === true;
    // "normal" orders keep the ticket's actual pickup/delivery; anything else
    // (default) runs the air-tender cargo-hub redirect.
    if (body.mode === "normal") mode = "normal";
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const cfg = axisConfigFromEnv();

  // Dry run: build and return the order draft that will be converted to the
  // ClientPortal SubmitOrder payload, without authenticating or sending
  // anything. Missing ids fall back to 0 so the shape is still previewable.
  if (dryRun) {
    const previewDefaults: AxisOrderDefaults = {
      accountNo: cfg.accountNo ?? "(portal account)",
      serviceId: cfg.serviceId ?? 0,
      vehicleId: cfg.vehicleId ?? 0,
      packageId: cfg.packageId ?? 0,
      caller: cfg.caller,
      mode,
    };
    const order = mappingToAxisOrder(mapping, previewDefaults);
    const placeholders: string[] = [];
    if (cfg.serviceId === undefined) placeholders.push("ServiceId");
    if (cfg.vehicleId === undefined) placeholders.push("VehicleId");
    if (cfg.packageId === undefined) placeholders.push("PackageId");
    return NextResponse.json({
      dryRun: true,
      endpoint: "POST /ClientPortal/ClientPortal/api/newOrderOnline/SubmitOrder",
      order,
      skipped: order ? [] : [mapping?.type ?? "unknown"],
      placeholders,
    });
  }

  if (!AXIS_SUBMITTABLE_TYPES.has(mapping?.type)) {
    return NextResponse.json(
      { error: `Nothing to submit. Axis orders can only be created from: ${[...AXIS_SUBMITTABLE_TYPES].join(", ")}.` },
      { status: 400 }
    );
  }

  const missing: string[] = [];
  if (!(cfg.username && cfg.password)) missing.push("AXIS_USERNAME + AXIS_PASSWORD");
  if (missing.length > 0) {
    return NextResponse.json({ error: `Axis is not configured. Set: ${missing.join(", ")}.` }, { status: 400 });
  }

  try {
    // Resolve the service/vehicle ids (configured override, else looked up from
    // the account). These are authenticated calls, so they also validate the token.
    const [serviceId, vehicleId] = await Promise.all([resolveServiceId(cfg), resolveVehicleId(cfg)]);
    const defaults: AxisOrderDefaults = {
      accountNo: cfg.accountNo ?? "",
      serviceId,
      vehicleId,
      packageId: cfg.packageId ?? 0,
      caller: cfg.caller,
      mode,
    };

    const order = mappingToAxisOrder(mapping, defaults);
    if (!order) {
      return NextResponse.json({ error: "Could not build an order from this document." }, { status: 400 });
    }

    const result = await submitOrders([order], cfg);
    const orderTrackingId = String(result.OrdersCreated?.[0] ?? "");

    // Record the created order to the persistent log. Best-effort — never fail
    // the submit over logging.
    if (orderTrackingId) {
      const entry: LoggedOrder = {
        orderTrackingId,
        submittedAt: new Date().toISOString(),
        accountNo: order.AccountNo,
        serviceId: order.ServiceId,
        vehicleId: order.VehicleId,
        clientRefNo: order.ClientRefNo,
        clientRefNo2: order.ClientRefNo2,
        pickup: order.PCoName,
        delivery: order.DCoName,
        specInstr: order.SpecInstr,
        sourceEmailId,
      };
      await appendLoggedOrders([entry]);
    }

    return NextResponse.json({ ok: true, orderTrackingId });
  } catch (err) {
    const status = err instanceof AxisError && err.status ? err.status : 502;
    console.error("Axis submit failed:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed to submit to Axis." }, { status });
  }
}
