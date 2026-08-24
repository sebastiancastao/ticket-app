import { EmbedEmailBoard } from "@/components/EmbedEmailBoard";

// Not gated by the session-cookie proxy (only /tickets is) — this page
// authenticates via ?token= instead, since cookies don't survive a
// cross-domain iframe. See src/lib/embed-tokens.ts.
export default async function EmbedTicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <div className="flex w-full flex-1 flex-col px-4 py-6">
      <EmbedEmailBoard token={token ?? ""} />
    </div>
  );
}
