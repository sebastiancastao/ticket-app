"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import {
  addTicket,
  updateTicketStatus,
  type TicketPriority,
  type TicketStatus,
} from "./tickets";

const VALID_PRIORITIES: TicketPriority[] = ["low", "medium", "high"];
const VALID_STATUSES: TicketStatus[] = ["open", "in_progress", "closed"];

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

export async function createTicketAction(formData: FormData) {
  await requireUser();

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const priorityRaw = String(formData.get("priority") ?? "medium");
  const priority = VALID_PRIORITIES.includes(priorityRaw as TicketPriority)
    ? (priorityRaw as TicketPriority)
    : "medium";

  if (!title) {
    throw new Error("Title is required");
  }

  const ticket = addTicket({ title, description, priority });
  revalidatePath("/tickets");
  redirect(`/tickets/${ticket.id}`);
}

export async function updateStatusAction(id: string, statusRaw: string) {
  await requireUser();

  const status = VALID_STATUSES.includes(statusRaw as TicketStatus)
    ? (statusRaw as TicketStatus)
    : undefined;
  if (!status) return;

  updateTicketStatus(id, status);
  revalidatePath("/tickets");
  revalidatePath(`/tickets/${id}`);
}
