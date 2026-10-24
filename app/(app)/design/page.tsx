import { Suspense } from "react";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/harpy/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getServerViewer } from "@/lib/session";
import { DesignShowcase } from "./_components/design-showcase";

export const metadata = { title: "Design - harpy" };

// A reference of every design token and component, light and dark side by
// side. It is for the signed-in owner only, so signed-out visits go home.
export default function DesignPage() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-6">
      <PageHeader
        description="Every token and component in light and dark."
        title="Design"
      />
      <Suspense fallback={<Skeleton className="h-96 w-full" />}>
        <DesignGate />
      </Suspense>
    </div>
  );
}

async function DesignGate() {
  const viewer = await getServerViewer();

  if (!viewer) {
    redirect("/");
  }

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <div className="light rounded-xl border border-border bg-background p-4 text-foreground">
        <DesignShowcase label="Light" />
      </div>
      <div className="dark rounded-xl border border-border bg-background p-4 text-foreground">
        <DesignShowcase label="Dark" />
      </div>
    </div>
  );
}
