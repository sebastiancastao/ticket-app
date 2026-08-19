import { STATUS_LABELS, type TicketStatus } from "@/lib/tickets";

const STYLES: Record<TicketStatus, string> = {
  open: "bg-amber-100 text-amber-800 dark:bg-amber-500/10 dark:text-amber-400",
  in_progress: "bg-blue-100 text-blue-800 dark:bg-blue-500/10 dark:text-blue-400",
  closed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-400",
};

export function StatusBadge({ status }: { status: TicketStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}
