"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ComposerFooterControls } from "@/app/_components/chat/composer-footer-controls";
import { useChatShell } from "@/app/_components/chat-shell-context";
import { HarpyLogo } from "@/app/_components/harpy-logo";
import { HarpyWordmark } from "@/app/_components/harpy-wordmark";
import { ChatComposer } from "@/components/chat/composer";
import { showRequestError } from "@/components/harpy/show-request-error";
import { getChatMessageLengthError } from "@/lib/chat/limits";
import {
  createProvisionalChatId,
  writePendingChatMessage,
} from "@/lib/chat/provisional-chat";
import { filesToAttachments, writePendingAttachments } from "@/lib/chat/attachments";
import type { SetupStatus } from "@/lib/chat/types";

export function HomeChatPage() {
  const {
    requestSignIn,
    setActiveChatId,
    setupStatus,
    viewer,
  } = useChatShell();
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const setupReady = setupStatus.appReady;
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    setActiveChatId(null);
  }, [setActiveChatId]);

  useEffect(() => {
    if (pathname === "/chat") {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }, [pathname]);

  useEffect(() => {
    if (!viewer) {
      return;
    }

    const restoredDraft = window.sessionStorage.getItem("eve-chat-draft");

    if (restoredDraft) {
      setDraft(restoredDraft);
      window.sessionStorage.removeItem("eve-chat-draft");
    }
  }, [viewer]);

  const handleSubmit = useCallback(
    async (text: string, files: File[]) => {
      const message = text.trim();

      if (submittingRef.current) {
        return;
      }

      if (!message) {
        if (files.length > 0) {
          showRequestError("Add a short message to send with your files.");
        }
        return;
      }

      const lengthError = getChatMessageLengthError(message);

      if (lengthError) {
        showRequestError(lengthError);
        return;
      }

      if (!setupReady) {
        showRequestError(
          getHomeComposerDisabledReason({ setupStatus, submitting }) ??
            "Finish setup before chatting.",
        );
        return;
      }

      if (!viewer) {
        requestSignIn(message);
        return;
      }

      submittingRef.current = true;
      setSubmitting(true);
      setDraft("");

      const provisionalChatId = createProvisionalChatId();
      const didStoreMessage = writePendingChatMessage(provisionalChatId, message);

      if (!didStoreMessage) {
        submittingRef.current = false;
        setSubmitting(false);
        setDraft(message);
        showRequestError("Failed to start chat.");
        return;
      }

      if (files.length > 0) {
        try {
          const stored = writePendingAttachments(
            provisionalChatId,
            await filesToAttachments(files),
          );
          if (!stored) {
            showRequestError(
              "Those files are too large to carry from the start page. Open the chat and attach them there.",
            );
          }
        } catch {
          // Attachments couldn't be read; continue with the text-only message.
        }
      }

      setActiveChatId(provisionalChatId);
      router.push(`/chat/${provisionalChatId}`, { scroll: false });
    },
    [
      requestSignIn,
      router,
      setActiveChatId,
      setupReady,
      setupStatus,
      submitting,
      viewer,
    ],
  );

  const composerDisabled = !setupReady;
  const composerDisabledReason = getHomeComposerDisabledReason({
    setupStatus,
    submitting,
  });

  if (pathname !== "/chat") {
    return null;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col justify-between px-4 pt-8 pb-4 sm:px-6 sm:pb-6">
        <div className="flex min-h-0 flex-1 items-center justify-center pb-20 sm:pb-[12vh]">
          <div className="w-full max-w-2xl space-y-5 sm:space-y-7 md:space-y-8">
            <h1 className="flex items-center justify-center gap-3 sm:gap-4">
              <HarpyLogo className="size-12 sm:size-14 md:size-16" />
              <HarpyWordmark className="text-4xl sm:text-5xl md:text-6xl" />
            </h1>
            <ChatComposer
              autoFocus
              disabled={composerDisabled}
              disabledReason={composerDisabledReason}
              footerStart={<ComposerFooterControls setupStatus={setupStatus} />}
              isPreparing={submitting}
              onChange={setDraft}
              onStop={() => {}}
              onSubmit={handleSubmit}
              value={draft}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function getHomeComposerDisabledReason({
  setupStatus,
  submitting,
}: {
  readonly setupStatus: SetupStatus;
  readonly submitting: boolean;
}) {
  if (!setupStatus.databaseConfigured) {
    return "Connect Neon Postgres before chatting.";
  }

  if (!setupStatus.databaseSchemaReady) {
    return "Run database migrations: vercel env run -e production -- pnpm db:migrate.";
  }

  if (!setupStatus.authReady) {
    const missing = setupStatus.missing.length
      ? ` Missing: ${setupStatus.missing.join(", ")}.`
      : "";

    return `Finish auth setup before chatting.${missing}`;
  }

  if (!setupStatus.rateLimitReady) {
    return "Provision Upstash Redis before chatting.";
  }

  if (!setupStatus.secretsReady) {
    return "Set SOCIAL_TOKEN_ENCRYPTION_KEY before chatting.";
  }

  if (submitting) {
    return "Preparing chat.";
  }

  return undefined;
}
