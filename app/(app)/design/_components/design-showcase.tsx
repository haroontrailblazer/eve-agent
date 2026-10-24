"use client";

import { InboxIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ChannelStatusPill } from "@/components/harpy/channel-status-pill";
import { DraftCard } from "@/components/harpy/draft-card";
import { EmptyState } from "@/components/harpy/empty-state";
import { IdeaBlock } from "@/components/harpy/idea-block";
import { KbdHint } from "@/components/harpy/kbd-hint";
import { MetricTile } from "@/components/harpy/metric-tile";
import { PlatformChip } from "@/components/harpy/platform-chip";
import { StatusChip } from "@/components/harpy/status-chip";
import { TimelineItem } from "@/components/harpy/timeline-item";
import { WorkingIndicator } from "@/components/harpy/working-indicator";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { DRAFT_STATUS_META, type DraftStatus } from "@/lib/draft-status";
import { PLATFORMS, type PlatformKey } from "@/lib/platforms";

const COLOR_TOKENS = [
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "border",
  "input",
  "ring",
  "status-draft",
  "status-review",
  "status-scheduled",
  "status-posted",
  "status-failed",
  "platform-x",
  "platform-linkedin",
  "platform-threads",
  "platform-whatsapp",
  "platform-slack",
  "sidebar",
  "sidebar-foreground",
  "sidebar-primary",
  "sidebar-primary-foreground",
  "sidebar-accent",
  "sidebar-accent-foreground",
  "sidebar-border",
  "sidebar-ring",
] as const;

const TYPE_SCALE = [
  { className: "text-display", name: "Display" },
  { className: "text-title", name: "Title" },
  { className: "text-heading", name: "Heading" },
  { className: "text-body", name: "Body" },
  { className: "text-small", name: "Small" },
  { className: "text-meta", name: "Meta" },
] as const;

const STATUSES = Object.keys(DRAFT_STATUS_META) as DraftStatus[];
const PLATFORM_KEYS = Object.keys(PLATFORMS) as PlatformKey[];

export function DesignShowcase({ label }: { readonly label: string }) {
  const [switchOn, setSwitchOn] = useState(true);

  return (
    <div className="flex flex-col gap-8">
      <h2 className="text-title">{label}</h2>

      <Block title="Color tokens">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {COLOR_TOKENS.map((token) => (
            <div className="flex items-center gap-2" key={token}>
              <span
                className="size-6 shrink-0 rounded-md border border-border"
                style={{ backgroundColor: `var(--${token})` }}
              />
              <span className="truncate font-mono text-meta text-muted-foreground">{token}</span>
            </div>
          ))}
        </div>
      </Block>

      <Block title="Type scale">
        <div className="flex flex-col gap-1">
          {TYPE_SCALE.map((step) => (
            <p className={step.className} key={step.name}>
              {step.name}: harpy writes in your voice
            </p>
          ))}
          <p className="font-mono text-small">Mono: 0123456789 user_abc123</p>
        </div>
      </Block>

      <Block title="Button and Badge">
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button">Default</Button>
          <Button type="button" variant="secondary">
            Secondary
          </Button>
          <Button type="button" variant="outline">
            Outline
          </Button>
          <Button type="button" variant="ghost">
            Ghost
          </Button>
          <Button type="button" variant="destructive">
            Destructive
          </Button>
          <Button type="button" variant="link">
            Link
          </Button>
          <Button disabled type="button">
            Disabled
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="outline">Outline</Badge>
          <Badge variant="destructive">Destructive</Badge>
        </div>
      </Block>

      <Block title="Status chips">
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((status) => (
            <StatusChip key={status} status={status} />
          ))}
        </div>
      </Block>

      <Block title="Platform chips">
        <div className="flex flex-wrap gap-2">
          {PLATFORM_KEYS.map((platform) => (
            <PlatformChip key={platform} platform={platform} />
          ))}
        </div>
      </Block>

      <Block title="Draft cards">
        <DraftCard
          meta="From your note on Monday"
          onApprove={() => {}}
          onEdit={() => {}}
          onSkip={() => {}}
          platform="x"
          scheduledLabel="Tomorrow 9:00"
          status="needs_review"
          text="Shipping beats polishing. Put the rough version in front of people today."
        />
        <DraftCard
          isWorking
          meta="Refining tone"
          platform="linkedin"
          status="draft"
          text="Three lessons from a year of building in public."
        />
        <DraftCard
          isSelected
          meta="Selected with the keyboard"
          onApprove={() => {}}
          onEdit={() => {}}
          onSkip={() => {}}
          platform="threads"
          status="scheduled"
          text="Small teams move fast because nobody waits on a meeting."
        />
      </Block>

      <Block title="Idea block">
        <IdeaBlock sourceLabel="From chat, today" text="Why small teams ship faster">
          <StatusChip status="draft" />
        </IdeaBlock>
      </Block>

      <Block title="Empty state">
        <EmptyState
          action={
            <Button size="sm" type="button">
              Open chat
            </Button>
          }
          description="Mentions and replies will show up here."
          icon={InboxIcon}
          title="Your inbox is empty"
        />
      </Block>

      <Block title="Kbd hint, working indicator, channel status">
        <div className="flex flex-wrap items-center gap-4">
          <KbdHint keys={["Ctrl", "K"]} />
          <WorkingIndicator label="harpy is drafting" />
        </div>
        <div className="flex flex-wrap gap-2">
          <ChannelStatusPill platform="whatsapp" state="connected" />
          <ChannelStatusPill platform="slack" state="not_connected" />
          <ChannelStatusPill platform="x" state="needs_attention" />
        </div>
      </Block>

      <Block title="Timeline item and metric tile">
        <div className="flex flex-col">
          <TimelineItem platform="x" status="scheduled" time="9:00" title="Shipping beats polishing" />
          <TimelineItem platform="linkedin" status="posted" time="12:30" title="Three lessons" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <MetricTile delta="+12% this week" label="Impressions" value="12,480" />
          <MetricTile label="Posts" value="24" />
        </div>
      </Block>

      <Block title="Card, Tabs, Switch, ToggleGroup, Skeleton, Avatar">
        <Card>
          <CardHeader>
            <CardTitle>Card title</CardTitle>
            <CardDescription>Card description</CardDescription>
          </CardHeader>
          <CardContent>Card content</CardContent>
        </Card>
        <Tabs defaultValue="one">
          <TabsList>
            <TabsTrigger value="one">One</TabsTrigger>
            <TabsTrigger value="two">Two</TabsTrigger>
          </TabsList>
          <TabsContent value="one">First tab</TabsContent>
          <TabsContent value="two">Second tab</TabsContent>
        </Tabs>
        <div className="flex flex-wrap items-center gap-4">
          <Switch aria-label="Example switch" checked={switchOn} onCheckedChange={setSwitchOn} />
          <ToggleGroup defaultValue="light" type="single" variant="outline">
            <ToggleGroupItem value="system">System</ToggleGroupItem>
            <ToggleGroupItem value="light">Light</ToggleGroupItem>
            <ToggleGroupItem value="dark">Dark</ToggleGroupItem>
          </ToggleGroup>
          <Avatar>
            <AvatarFallback>H</AvatarFallback>
          </Avatar>
        </div>
        <Skeleton className="h-8 w-full" />
      </Block>

      <Block title="Dialog and toast">
        <div className="flex flex-wrap items-center gap-2">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="outline">
                Open alert dialog
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this draft?</AlertDialogTitle>
                <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction variant="destructive">Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <Button onClick={() => toast("Saved")} type="button" variant="outline">
            Show toast
          </Button>
        </div>
      </Block>
    </div>
  );
}

function Block({ children, title }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-small font-medium text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}
