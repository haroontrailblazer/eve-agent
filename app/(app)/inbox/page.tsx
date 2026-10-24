import { InboxIcon } from "lucide-react";
import { EmptyState } from "@/components/harpy/empty-state";
import { PageHeader } from "@/components/harpy/page-header";

export default function InboxPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 md:px-6">
      <PageHeader title="Inbox" />
      <EmptyState
        description="Mentions and replies from X and Threads will show up here."
        icon={InboxIcon}
        title="Your inbox is empty"
      />
    </div>
  );
}
