import { SunIcon } from "lucide-react";
import { EmptyState } from "@/components/harpy/empty-state";
import { PageHeader } from "@/components/harpy/page-header";

export default function BriefPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 md:px-6">
      <PageHeader title="Brief" />
      <EmptyState
        description="Your morning brief will show up here each day."
        icon={SunIcon}
        title="No brief yet"
      />
    </div>
  );
}
