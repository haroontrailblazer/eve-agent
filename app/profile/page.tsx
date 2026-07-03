import { Suspense, type ComponentType, type ReactNode } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeftIcon, CalendarClockIcon, PlugIcon, SparklesIcon } from "lucide-react";
import {
  HarpyMarkIcon,
  LinearIcon,
  LinkedInIcon,
  NotionIcon,
  SentryIcon,
  ThreadsIcon,
  XIcon,
} from "@/components/icons";
import { listMcpConnections } from "@/lib/db/mcp";
import type { McpConnection } from "@/lib/db/schema";
import { getServerViewer } from "@/lib/session";
import { ProfileSignOut } from "./_components/profile-sign-out";

export const metadata = { title: "Profile — harpy" };

type PlatformMeta = { readonly label: string; readonly Icon: ComponentType<{ readonly className?: string }> };

const PLATFORM_META: Record<string, PlatformMeta> = {
  linear: { Icon: LinearIcon, label: "Linear" },
  linkedin: { Icon: LinkedInIcon, label: "LinkedIn" },
  notion: { Icon: NotionIcon, label: "Notion" },
  sentry: { Icon: SentryIcon, label: "Sentry" },
  threads: { Icon: ThreadsIcon, label: "Threads" },
  x: { Icon: XIcon, label: "X" },
};

function metaFor(platform: string): PlatformMeta {
  return (
    PLATFORM_META[platform] ?? {
      Icon: PlugIcon,
      label: platform.charAt(0).toUpperCase() + platform.slice(1),
    }
  );
}

const SKILLS = [
  { name: "Social posting", detail: "Publish to LinkedIn, X, and Threads via connected MCP accounts." },
  { name: "Workspace tools", detail: "Search and edit Notion, Linear issues, and Sentry via connections." },
  { name: "Connection management", detail: "Connect, switch, and disconnect MCP accounts on request." },
];

export default function ProfilePage() {
  return (
    <div className="min-h-full bg-background text-foreground">
      <div className="mx-auto w-full max-w-3xl px-5 py-8 sm:px-6 sm:py-12">
        <Link
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          href="/"
        >
          <ArrowLeftIcon className="size-4" />
          Back to chat
        </Link>

        <Suspense fallback={<ProfileSkeleton />}>
          <ProfileContent />
        </Suspense>
      </div>
    </div>
  );
}

async function ProfileContent() {
  const viewer = await getServerViewer();

  if (!viewer) {
    redirect("/");
  }

  const connections = await listMcpConnections(viewer.id);

  return (
    <>
      {/* User card */}
      <section className="mt-6 flex flex-col gap-5 rounded-xl border border-border bg-card p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex min-w-0 items-center gap-4">
          <Avatar image={viewer.image} name={viewer.name} />
          <div className="min-w-0">
            <h1 className="truncate text-xl font-semibold tracking-tight">{viewer.name}</h1>
            <p className="truncate text-sm text-muted-foreground">{viewer.email}</p>
            <p className="mt-1.5 text-[11px] text-muted-foreground/70">User ID</p>
            <code className="block max-w-full truncate font-mono text-xs text-muted-foreground">
              {viewer.id}
            </code>
          </div>
        </div>
        <ProfileSignOut userId={viewer.id} />
      </section>

      {/* MCP connections */}
      <Panel
        icon={<PlugIcon className="size-4" />}
        subtitle="Stored in your database. Ask harpy to connect or switch accounts."
        title="MCP connections"
      >
        {connections.length === 0 ? (
          <Empty>
            No MCP connections yet. In chat, try{" "}
            <span className="text-foreground">“connect LinkedIn to @myhandle”</span> — harpy saves
            it here and tells you the account.
          </Empty>
        ) : (
          <ul className="flex flex-col gap-2">
            {connections.map((connection) => (
              <ConnectionRow connection={connection} key={connection.id} />
            ))}
          </ul>
        )}
      </Panel>

      {/* Skills */}
      <Panel
        icon={<SparklesIcon className="size-4" />}
        subtitle="What harpy can do for you right now."
        title="Skills"
      >
        <ul className="flex flex-col gap-2">
          {SKILLS.map((skill) => (
            <li className="rounded-lg border border-border/70 bg-background/40 p-3" key={skill.name}>
              <p className="text-sm font-medium text-foreground">{skill.name}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{skill.detail}</p>
            </li>
          ))}
        </ul>
      </Panel>

      {/* Scheduled tasks */}
      <Panel
        icon={<CalendarClockIcon className="size-4" />}
        subtitle="Recurring or timed runs you set up with harpy."
        title="Scheduled tasks"
      >
        <Empty>No scheduled tasks yet. Scheduling is coming next — ask me to wire it up.</Empty>
      </Panel>
    </>
  );
}

function ProfileSkeleton() {
  return (
    <div className="mt-6 space-y-4" aria-hidden>
      <div className="h-28 animate-pulse rounded-xl border border-border bg-card" />
      <div className="h-40 animate-pulse rounded-xl border border-border bg-card" />
    </div>
  );
}

function Avatar({ image, name }: { readonly image: string | null; readonly name: string }) {
  if (image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        alt=""
        className="size-14 shrink-0 rounded-xl border border-border object-cover"
        src={image}
      />
    );
  }

  return (
    <span className="flex size-14 shrink-0 items-center justify-center rounded-xl border border-border bg-background">
      <HarpyMarkIcon className="size-7 text-foreground" />
      <span className="sr-only">{name}</span>
    </span>
  );
}

function Panel({
  children,
  icon,
  subtitle,
  title,
}: {
  readonly children: ReactNode;
  readonly icon: ReactNode;
  readonly subtitle: string;
  readonly title: string;
}) {
  return (
    <section className="mt-4 rounded-xl border border-border bg-card p-5 sm:p-6">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex size-8 items-center justify-center rounded-md border border-border bg-background text-muted-foreground">
          {icon}
        </span>
        <div>
          <h2 className="text-sm font-semibold text-foreground">{title}</h2>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function ConnectionRow({ connection }: { readonly connection: McpConnection }) {
  const meta = metaFor(connection.platform);

  return (
    <li className="flex items-center gap-3 rounded-lg border border-border/70 bg-background/40 p-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-background text-foreground">
        <meta.Icon className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{meta.label}</p>
        <p className="truncate text-xs text-muted-foreground">
          {connection.account ? `Account: ${connection.account}` : "No account set"}
        </p>
      </div>
      <span
        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
          connection.enabled
            ? "bg-emerald-500/15 text-emerald-500"
            : "bg-muted text-muted-foreground"
        }`}
      >
        {connection.enabled ? "Connected" : "Disabled"}
      </span>
    </li>
  );
}

function Empty({ children }: { readonly children: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-background/40 p-4 text-sm text-muted-foreground">
      {children}
    </div>
  );
}
