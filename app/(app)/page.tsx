import { LayoutDashboardIcon } from "lucide-react";
import Link from "next/link";
import { EmptyState } from "@/components/harpy/empty-state";
import { PageHeader } from "@/components/harpy/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function StudioPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 md:px-6">
      <PageHeader title="Studio" />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
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
        <aside className="flex flex-col gap-4">
          <RailCard description="Your daily brief will show up here." title="Morning brief" />
          <RailCard description="Scheduled posts will show up here." title="Up next" />
        </aside>
      </div>
    </div>
  );
}

function RailCard({ description, title }: { readonly title: string; readonly description: string }) {
  return (
    <Card className="gap-2 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-heading">{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-4">
        <CardDescription>{description}</CardDescription>
      </CardContent>
    </Card>
  );
}
