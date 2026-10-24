import { MicIcon } from "lucide-react";
import { EmptyState } from "@/components/harpy/empty-state";
import { PageHeader } from "@/components/harpy/page-header";

export default function BrandVoicePage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 md:px-6">
      <PageHeader title="Brand voice" />
      <EmptyState
        description="Teach harpy how you write. This arrives in the next stage."
        icon={MicIcon}
        title="Brand voice is coming"
      />
    </div>
  );
}
