import Link from "next/link";
import { notFound } from "next/navigation";
import { getTicket, PRIORITY_LABELS, type TicketStatus } from "@/lib/tickets";
import { StatusBadge } from "@/components/StatusBadge";
import { updateStatusAction } from "@/lib/actions";

const STATUS_OPTIONS: { value: TicketStatus; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "closed", label: "Closed" },
];

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ticket = getTicket(id);

  if (!ticket) {
    notFound();
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-12">
      <Link href="/tickets" className="text-sm text-zinc-500 hover:text-zinc-950 dark:text-zinc-400 dark:hover:text-zinc-50">
        ← Back to tickets
      </Link>

      <div className="flex flex-col gap-4 rounded-xl border border-black/[.08] bg-white p-6 dark:border-white/[.145] dark:bg-[#0a0a0a]">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
              #{ticket.id} · {ticket.title}
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Priority: {PRIORITY_LABELS[ticket.priority]} · Created on{" "}
              {new Date(ticket.createdAt).toLocaleString("en-US")}
            </p>
          </div>
          <StatusBadge status={ticket.status} />
        </div>

        <p className="whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">
          {ticket.description || "No description."}
        </p>

        <div className="mt-2 flex flex-col gap-2 border-t border-black/[.08] pt-4 dark:border-white/[.145]">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Change status
          </span>
          <div className="flex flex-wrap gap-2">
            {STATUS_OPTIONS.map((option) => (
              <form
                key={option.value}
                action={updateStatusAction.bind(null, ticket.id, option.value)}
              >
                <button
                  type="submit"
                  disabled={ticket.status === option.value}
                  className="rounded-full border border-black/[.08] px-4 py-1.5 text-sm font-medium transition-colors hover:bg-black/[.04] disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
                >
                  {option.label}
                </button>
              </form>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
