import Link from "next/link";
import { getTickets, PRIORITY_LABELS } from "@/lib/tickets";
import { StatusBadge } from "@/components/StatusBadge";

export default function TicketsPage() {
  const tickets = getTickets();

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Tickets
        </h1>
        <Link
          href="/tickets/new"
          className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
        >
          New ticket
        </Link>
      </div>

      {tickets.length === 0 ? (
        <p className="text-zinc-500 dark:text-zinc-400">
          No tickets yet. Create the first one.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-black/[.08] rounded-xl border border-black/[.08] bg-white dark:divide-white/[.145] dark:border-white/[.145] dark:bg-[#0a0a0a]">
          {tickets.map((ticket) => (
            <li key={ticket.id}>
              <Link
                href={`/tickets/${ticket.id}`}
                className="flex flex-col gap-2 px-5 py-4 transition-colors hover:bg-black/[.02] dark:hover:bg-white/[.03] sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex flex-col gap-1">
                  <span className="font-medium text-zinc-950 dark:text-zinc-50">
                    #{ticket.id} · {ticket.title}
                  </span>
                  <span className="text-sm text-zinc-500 dark:text-zinc-400">
                    Priority: {PRIORITY_LABELS[ticket.priority]}
                  </span>
                </div>
                <StatusBadge status={ticket.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
