"use client";

import { useCallback, useEffect, useState } from "react";
import {
  createLinkCodeAction,
  listLinkedChannelsAction,
  unlinkChannelAction,
} from "@/app/actions/channels";
import { useChatShell } from "@/app/_components/chat-shell-context";
import { ChannelStatusPill } from "@/components/harpy/channel-status-pill";
import { ConfirmActionButton } from "@/components/harpy/confirm-action-button";
import { showRequestError } from "@/components/harpy/show-request-error";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { LinkedRow } from "@/lib/channels/view";
import type { ChannelIdentityKind } from "@/lib/db/channel-identities";

type Listing =
  | {
      readonly ok: true;
      readonly whatsappConfigured: boolean;
      readonly slackConfigured: boolean;
      readonly rows: readonly LinkedRow[];
    }
  | { readonly ok: false };

type Code = { readonly code: string; readonly waLink: string | null; readonly qrSvg: string | null };

// A failed request reads the same as a failed listing, never as "nothing linked".
async function readListing(): Promise<Listing> {
  try {
    const result = await listLinkedChannelsAction();
    return result.ok ? result : { ok: false };
  } catch {
    return { ok: false };
  }
}

export function MessagingSection() {
  const { requestSignIn, viewer } = useChatShell();
  const viewerId = viewer?.id ?? null;
  const [listing, setListing] = useState<Listing | null>(null);

  const load = useCallback(async () => {
    setListing(await readListing());
  }, []);

  useEffect(() => {
    if (!viewerId) return;
    let cancelled = false;

    void readListing().then((next) => {
      if (!cancelled) setListing(next);
    });

    return () => {
      cancelled = true;
    };
  }, [viewerId]);

  if (!viewerId) {
    return (
      <Card className="flex-row items-center justify-between gap-3 p-4">
        <p className="text-small text-muted-foreground">Sign in to link WhatsApp and Slack.</p>
        <Button onClick={() => requestSignIn()} size="sm" type="button" variant="outline">
          Sign in
        </Button>
      </Card>
    );
  }

  if (listing === null) {
    return <Skeleton className="h-32 w-full" />;
  }

  if (!listing.ok) {
    return (
      <Card className="flex-row items-center justify-between gap-3 p-4" role="alert">
        <p className="text-small text-muted-foreground">Couldn&apos;t load your linked channels.</p>
        <Button
          onClick={() => {
            setListing(null);
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

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <ChannelCard
        channel="whatsapp"
        configured={listing.whatsappConfigured}
        linkLabel="Link a phone"
        notConfigured="Not set up yet. The setup guide is docs/whatsapp-setup.md."
        onChanged={load}
        promptText="Send this to harpy on WhatsApp within 10 minutes:"
        rows={listing.rows.filter((row) => row.channel === "whatsapp")}
      />
      <ChannelCard
        channel="slack"
        configured={listing.slackConfigured}
        linkLabel="Link Slack"
        notConfigured="Not set up yet. Slack needs the SLACK_CONNECTOR setting."
        onChanged={load}
        promptText="In Slack, send harpy a direct message within 10 minutes:"
        rows={listing.rows.filter((row) => row.channel === "slack")}
      />
    </div>
  );
}

function ChannelCard({
  channel,
  configured,
  linkLabel,
  notConfigured,
  onChanged,
  promptText,
  rows,
}: {
  readonly channel: ChannelIdentityKind;
  readonly configured: boolean;
  readonly linkLabel: string;
  readonly notConfigured: string;
  readonly onChanged: () => Promise<void>;
  readonly promptText: string;
  readonly rows: readonly LinkedRow[];
}) {
  const [code, setCode] = useState<Code | null>(null);
  const [creating, setCreating] = useState(false);

  async function link() {
    if (creating) return;
    setCreating(true);

    try {
      const result = await createLinkCodeAction({ channel });

      if (result.ok) {
        setCode({ code: result.code, waLink: result.waLink, qrSvg: result.qrSvg });
      } else {
        showRequestError(result.message);
      }
    } catch {
      showRequestError("Couldn't create a link code. Try again in a moment.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <Card className="gap-3 p-4">
      <div>
        <ChannelStatusPill platform={channel} state={configured ? "connected" : "not_connected"} />
      </div>
      {!configured ? <p className="text-small text-muted-foreground">{notConfigured}</p> : null}
      {rows.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => (
            <li className="flex items-center gap-3" key={row.id}>
              <div className="min-w-0 flex-1">
                <p className="truncate text-small font-medium text-foreground">{row.label}</p>
                <p className="text-meta text-muted-foreground">Linked {row.linkedOn}</p>
              </div>
              <ConfirmActionButton
                confirmBody="harpy will stop answering this number until you link it again."
                confirmLabel="Unlink"
                confirmTitle="Unlink this number?"
                label="Unlink"
                onConfirm={async () => {
                  const result = await unlinkChannelAction({ id: row.id });

                  if (!result.ok) {
                    throw new Error(result.message);
                  }

                  await onChanged();
                }}
                pendingLabel="Unlinking..."
              />
            </li>
          ))}
        </ul>
      ) : null}
      {configured ? (
        <div className="flex flex-col gap-3">
          <div>
            <Button disabled={creating} onClick={() => void link()} size="sm" type="button" variant="outline">
              {linkLabel}
            </Button>
          </div>
          {code ? <CodePanel code={code} promptText={promptText} /> : null}
        </div>
      ) : null}
    </Card>
  );
}

function CodePanel({ code, promptText }: { readonly code: Code; readonly promptText: string }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-small text-muted-foreground">{promptText}</p>
      <code className="w-fit rounded-md bg-muted px-2 py-1 font-mono text-body text-foreground">
        LINK {code.code}
      </code>
      {code.waLink ? (
        <a
          className="w-fit text-small font-medium text-foreground underline underline-offset-4"
          href={code.waLink}
          rel="noreferrer"
          target="_blank"
        >
          Open WhatsApp
        </a>
      ) : null}
      {code.qrSvg ? (
        <div className="flex flex-col gap-1">
          <div
            aria-hidden="true"
            className="size-40 rounded-md bg-white p-1 [&>svg]:size-full"
            // Generated by the qrcode library from a digits-only wa.me link.
            dangerouslySetInnerHTML={{ __html: code.qrSvg }}
          />
          <p className="text-meta text-muted-foreground">Or scan this with your phone&apos;s camera.</p>
        </div>
      ) : null}
    </div>
  );
}
