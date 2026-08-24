import { EmailExtractionBoard } from "@/components/EmailExtractionBoard";

export default function TicketsPage() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-12">
      <EmailExtractionBoard />
    </div>
  );
}
