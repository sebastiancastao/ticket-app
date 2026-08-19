import Link from "next/link";
import { getTickets } from "@/lib/tickets";
import { EmailExtractionBoard } from "@/components/EmailExtractionBoard";

export default function Home() {
  const tickets = getTickets();
  const counts = {
    open: tickets.filter((t) => t.status === "open").length,
    in_progress: tickets.filter((t) => t.status === "in_progress").length,
    closed: tickets.filter((t) => t.status === "closed").length,
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-6 py-16">
      <div className="flex flex-col gap-3">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-950 dark:text-zinc-50">
          Welcome to Ticket App
        </h1>
        <p className="max-w-xl text-zinc-600 dark:text-zinc-400">
          A ticket management skeleton built with Next.js App Router,
          TypeScript, Tailwind CSS, and Server Actions. Data lives in memory,
          ready to connect to a real database.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Open" value={counts.open} />
        <StatCard label="In Progress" value={counts.in_progress} />
        <StatCard label="Closed" value={counts.closed} />
      </div>

      <div className="flex gap-4">
        <Link
          href="/tickets"
          className="rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-colors hover:bg-[#383838] dark:hover:bg-[#ccc]"
        >
          View all tickets
        </Link>
        <Link
          href="/tickets/new"
          className="rounded-full border border-black/[.08] px-5 py-2.5 text-sm font-medium transition-colors hover:bg-black/[.04] dark:border-white/[.145] dark:hover:bg-[#1a1a1a]"
        >
          Create ticket
        </Link>
      </div>

      <EmailExtractionBoard />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-black/[.08] bg-white p-5 dark:border-white/[.145] dark:bg-[#0a0a0a]">
      <p className="text-sm text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-1 text-3xl font-semibold text-zinc-950 dark:text-zinc-50">{value}</p>
    </div>
  );
}
