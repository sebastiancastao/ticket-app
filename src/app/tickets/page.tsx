import { redirect } from "next/navigation";

// The tickets board now lives at the site root — keep this path alive for
// existing bookmarks/links instead of leaving it 404.
export default function TicketsPage() {
  redirect("/");
}
