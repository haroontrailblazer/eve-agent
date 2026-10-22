"use client";

import { ChevronDownIcon, LockIcon } from "lucide-react";
import { useChatShell } from "@/app/_components/chat-shell-context";
import { IntegrationsMenu } from "@/components/chat/integrations-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getSetupDisabledReason } from "@/lib/chat/setup-reason";
import type { SetupStatus } from "@/lib/chat/types";

export function ComposerFooterControls({
  setupStatus,
}: {
  readonly setupStatus: SetupStatus;
}) {
  const { enabledConnections, setConnectionEnabled } = useChatShell();

  return (
    <div className="flex min-w-0 max-w-full items-center gap-1.5 overflow-hidden">
      <ComposerHint setupStatus={setupStatus} />
      <IntegrationsMenu
        enabledConnections={enabledConnections}
        onConnectionEnabledChange={setConnectionEnabled}
        setupStatus={setupStatus}
      />
    </div>
  );
}

function ComposerHint({ setupStatus }: { readonly setupStatus: SetupStatus }) {
  if (!setupStatus.appReady) {
    const reason = getSetupDisabledReason(setupStatus) ?? "Finish setup before chatting.";

    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className="inline-flex h-8 min-w-0 max-w-full items-center gap-1 rounded-md px-2 text-[15px] text-muted-foreground/50"
            tabIndex={0}
          >
            <LockIcon className="size-3.5 shrink-0" />
            <span className="truncate">Setup required</span>
            <ChevronDownIcon className="size-3.5 shrink-0" />
          </span>
        </TooltipTrigger>
        <TooltipContent side="top">{reason}</TooltipContent>
      </Tooltip>
    );
  }

  return null;
}
