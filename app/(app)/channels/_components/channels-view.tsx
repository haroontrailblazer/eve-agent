"use client";

import { PlugIcon } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  disconnectMcpAction,
  listMcpConnectionsAction,
  type McpConnectionsResult,
} from "@/app/actions/mcp";
import { useChatShell } from "@/app/_components/chat-shell-context";
import { ChannelStatusPill } from "@/components/harpy/channel-status-pill";
import { ConfirmActionButton } from "@/components/harpy/confirm-action-button";
import { PLATFORM_ICONS, PLATFORM_TEXT_CLASS } from "@/components/harpy/platform-icon";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { McpConnectionSummary } from "@/lib/mcp-summary";
import { getPlatform, SOCIAL_PLATFORMS } from "@/lib/platforms";
import { cn } from "@/lib/utils";

export function ChannelsView() {
  // The same source as the sidebar's Slack pill, so the two always agree.
  const { slackConfigured } = useChatShell();

  return (
    <>
      <Section title="Social accounts">
        <div className="grid gap-3 sm:grid-cols-3">
          {SOCIAL_PLATFORMS.map((platform) => {
            const Icon = PLATFORM_ICONS[platform.key];

            return (
              <Card className="gap-3 p-4" key={platform.key}>
                <div className="flex items-center gap-2">
                  <Icon className={cn("size-4", PLATFORM_TEXT_CLASS[platform.key])} />
                  <span className="text-small font-medium text-foreground">{platform.label}</span>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex w-fit" tabIndex={0}>
                      <Button disabled size="sm" type="button" variant="outline">
                        Connect
                      </Button>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Available in a later stage</TooltipContent>
                </Tooltip>
              </Card>
            );
          })}
        </div>
      </Section>

      <Section title="Messaging">
        <div className="flex flex-wrap gap-2">
          <ChannelStatusPill platform="whatsapp" state="not_connected" />
          <ChannelStatusPill
            platform="slack"
            state={slackConfigured ? "connected" : "not_connected"}
          />
        </div>
      </Section>

      <Section title="Tools">
        <ToolsList />
      </Section>
    </>
  );
}

function Section({ children, title }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-heading text-foreground">{title}</h2>
      {children}
    </section>
  );
}

// A failed request reads the same as a failed listing: the tools could not be
// loaded, which is never shown as "no tools".
async function readConnections(): Promise<McpConnectionsResult> {
  try {
    return await listMcpConnectionsAction();
  } catch {
    return { ok: false };
  }
}

function ToolsList() {
  const { requestSignIn, viewer } = useChatShell();
  const viewerId = viewer?.id ?? null;
  const [result, setResult] = useState<McpConnectionsResult | null>(null);

  const load = useCallback(async () => {
    setResult(await readConnections());
  }, []);

  useEffect(() => {
    if (!viewerId) return;
    let cancelled = false;

    void readConnections().then((next) => {
      if (!cancelled) setResult(next);
    });

    return () => {
      cancelled = true;
    };
  }, [viewerId]);

  if (!viewerId) {
    return (
      <Card className="flex-row items-center justify-between gap-3 p-4">
        <p className="text-small text-muted-foreground">Sign in to see your connected tools.</p>
        <Button onClick={() => requestSignIn()} size="sm" type="button" variant="outline">
          Sign in
        </Button>
      </Card>
    );
  }

  if (result === null) {
    return <Skeleton className="h-16 w-full" />;
  }

  if (!result.ok) {
    return (
      <Card className="flex-row items-center justify-between gap-3 p-4" role="alert">
        <p className="text-small text-muted-foreground">Couldn&apos;t load tools.</p>
        <Button
          onClick={() => {
            setResult(null);
            void load();
          }}
          size="sm"
          type="button"
          variant="outline"
        >
          Try again
        </Button>
      </Card>
    );
  }

  const connections = result.connections;

  if (connections.length === 0) {
    return (
      <Card className="p-4">
        <p className="text-small text-muted-foreground">
          No tools connected yet. In chat, ask harpy to connect one, for example the DeepWiki MCP.
        </p>
      </Card>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {connections.map((connection) => (
        <ConnectionRow connection={connection} key={connection.platform} onChanged={load} />
      ))}
    </ul>
  );
}

function ConnectionRow({
  connection,
  onChanged,
}: {
  readonly connection: McpConnectionSummary;
  readonly onChanged: () => Promise<void>;
}) {
  const known = getPlatform(connection.platform);
  const Icon = known ? PLATFORM_ICONS[known.key] : PlugIcon;
  const label =
    known?.label ?? connection.platform.charAt(0).toUpperCase() + connection.platform.slice(1);

  return (
    <li>
      <Card className="flex-row items-center gap-3 p-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-background">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-small font-medium text-foreground">{label}</p>
          <p className="truncate text-meta text-muted-foreground">
            {connection.needsReconnect
              ? `Its saved sign-in can't be read. Ask harpy to connect ${label} again.`
              : connection.account
                ? `Account: ${connection.account}`
                : "No account set"}
          </p>
        </div>
        {connection.needsReconnect ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 text-meta text-muted-foreground">
            <span aria-hidden="true" className="size-1.5 rounded-full bg-status-failed" />
            Needs reconnect
          </span>
        ) : (
          <span className="shrink-0 text-meta text-muted-foreground">
            {connection.enabled ? "Connected" : "Disabled"}
          </span>
        )}
        <ConfirmActionButton
          confirmBody={`harpy will stop using ${label}. You can connect it again from chat.`}
          confirmLabel="Disconnect"
          confirmTitle={`Disconnect ${label}?`}
          label="Disconnect"
          onConfirm={async () => {
            const result = await disconnectMcpAction(connection.platform);

            if (!result.ok) {
              throw new Error(`Could not disconnect ${label}.`);
            }

            await onChanged();
          }}
          pendingLabel="Disconnecting..."
        />
      </Card>
    </li>
  );
}
