import { LayoutDashboardIcon } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/harpy/empty-state";
import { Button } from "@/components/ui/button";

// Placeholder until the Studio page is built.
export default function StudioPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-6">
      <EmptyState
        action={
          <Button asChild size="sm">
            <Link href="/chat">Open chat</Link>
          </Button>
        }
        description="Drafting for X, LinkedIn and Threads arrives in the next stage. For now, chat with harpy."
        icon={LayoutDashboardIcon}
        title="Your drafts will live here"
      />
    </div>
  );
}
