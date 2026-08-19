export type TicketStatus = "open" | "in_progress" | "closed";
export type TicketPriority = "low" | "medium" | "high";

export type Ticket = {
  id: string;
  title: string;
  description: string;
  status: TicketStatus;
  priority: TicketPriority;
  createdAt: string;
};

export const STATUS_LABELS: Record<TicketStatus, string> = {
  open: "Open",
  in_progress: "In Progress",
  closed: "Closed",
};

export const PRIORITY_LABELS: Record<TicketPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
};

// In-memory store. Resets on every redeploy or server restart; good enough
// for the skeleton, can be swapped for a real database later.
const tickets: Ticket[] = [
  {
    id: "1",
    title: "Can't log in",
    description: "The page keeps loading indefinitely after I enter my credentials.",
    status: "open",
    priority: "high",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
  },
  {
    id: "2",
    title: "Error 500 when uploading a file",
    description: "Only happens with PDF files larger than 5MB.",
    status: "in_progress",
    priority: "medium",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
  },
  {
    id: "3",
    title: "Feature request: export tickets to CSV",
    description: "It would be useful to be able to export the ticket list to CSV.",
    status: "closed",
    priority: "low",
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
  },
];

let nextId = tickets.length + 1;

export function getTickets(): Ticket[] {
  return [...tickets].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export function getTicket(id: string): Ticket | undefined {
  return tickets.find((t) => t.id === id);
}

export function addTicket(data: {
  title: string;
  description: string;
  priority: TicketPriority;
}): Ticket {
  const ticket: Ticket = {
    id: String(nextId++),
    title: data.title,
    description: data.description,
    priority: data.priority,
    status: "open",
    createdAt: new Date().toISOString(),
  };
  tickets.push(ticket);
  return ticket;
}

export function updateTicketStatus(id: string, status: TicketStatus): Ticket | undefined {
  const ticket = tickets.find((t) => t.id === id);
  if (ticket) {
    ticket.status = status;
  }
  return ticket;
}
