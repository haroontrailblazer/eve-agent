import { CalendarDaysIcon } from "lucide-react";
import { EmptyState } from "@/components/harpy/empty-state";
import { PageHeader } from "@/components/harpy/page-header";

export default function CalendarPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 md:px-6">
      <PageHeader title="Calendar" />
      <EmptyState
        description="Scheduled and published posts will show up here."
        icon={CalendarDaysIcon}
        title="Nothing scheduled yet"
      />
    </div>
  );
}
