import { EmailExtractionBoard } from "@/components/EmailExtractionBoard";
import { EmbedLinksPanel } from "@/components/EmbedLinksPanel";

export default function Home() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-6 px-6 py-12">
      <EmailExtractionBoard />
      <EmbedLinksPanel />
    </div>
  );
}
