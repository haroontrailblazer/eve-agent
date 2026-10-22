"use client";

import type { ClientSessionState, InputResponse, MessageStreamEvent } from "eve/client";
import { useEveAgent, type EveMessage } from "eve/react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  appendChatEventsAction,
  checkSendLimitAction,
  finalizeChatTurnAction,
  markChatPendingMessageAction,
  saveChatSessionAction,
} from "@/app/actions/chat";
import { uploadImageAction } from "@/app/actions/images";
import { listSkillsAction } from "@/app/actions/skills";
import { useChatShell } from "@/app/_components/chat-shell-context";
import { buildMessageContent, type Attachment } from "@/lib/chat/attachments";
import { buildTurnClientContext } from "@/lib/chat/client-context";
import { deriveChatView, type ChatStatus, type ChatViewState } from "@/lib/chat/derive";
import type { IndexedChatEvent } from "@/lib/chat/event-rows";
import type { ActiveChat, ChatListItem } from "@/lib/chat/types";
import type { SkillSummary } from "@/lib/skills/catalog";

// Stream events are saved in batches, one request per pause in the stream
// rather than one per text delta.
const EVENT_FLUSH_DELAY_MS = 300;

export type HarpyChat = ChatViewState & {
  readonly messages: readonly EveMessage[];
  readonly status: ChatStatus;
  readonly error: Error | undefined;
  readonly isCancelling: boolean;
  /** Resolves false when the send was blocked, so the caller can restore the draft. */
  send(text: string, attachments: readonly Attachment[]): Promise<boolean>;
  respond(responses: readonly InputResponse[]): Promise<void>;
  cancel(): Promise<void>;
};

type PreparingMessage = {
  readonly attachments: readonly Attachment[];
  readonly text: string;
};

/**
 * One chat's eve session: streams turns through useEveAgent, saves each new
 * stream event and the session cursor, and finalizes the chat when a turn
 * settles. Mount it with `key={chat.id}`: useEveAgent reads its options once.
 */
export function useHarpyChat({
  chat,
  onError,
  onTurnSettled,
}: {
  readonly chat: ActiveChat;
  readonly onTurnSettled: (item: ChatListItem) => void;
  readonly onError: (message: string) => void;
}): HarpyChat {
  const chatId = chat.id;
  const { enabledConnections } = useChatShell();
  // A message being sent, shown until eve projects its own optimistic bubble.
  const [preparing, setPreparing] = useState<PreparingMessage | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  const nextEventIndexRef = useRef(chat.events.length);
  const eventBufferRef = useRef<IndexedChatEvent[]>([]);
  const flushTimerRef = useRef<number | null>(null);
  const flushChainRef = useRef<Promise<void> | null>(null);
  const savedSessionIdRef = useRef(chat.session?.sessionId);
  const hasUnfinalizedEventsRef = useRef(false);
  const isCancellingRef = useRef(false);
  const skillsRef = useRef<readonly SkillSummary[] | null>(null);

  const flushEvents = useCallback((): Promise<void> => {
    if (flushTimerRef.current !== null) {
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }

    const batch = eventBufferRef.current;
    const previous = flushChainRef.current ?? Promise.resolve();

    if (batch.length === 0) {
      return previous;
    }

    eventBufferRef.current = [];
    flushChainRef.current = previous.then(async () => {
      try {
        await appendChatEventsAction({ chatId, events: batch });
      } catch (error) {
        // Keep the batch so the next flush retries it.
        eventBufferRef.current = [...batch, ...eventBufferRef.current];
        onError(toErrorMessage(error, "Failed to save chat progress."));
      }
    });

    return flushChainRef.current;
  }, [chatId, onError]);

  const finishTurn = async (session: ClientSessionState | undefined) => {
    // A resume that finds the turn already settled brings no new events.
    // Finalizing it would move an old chat to the top of the sidebar.
    if (!hasUnfinalizedEventsRef.current) {
      return;
    }

    hasUnfinalizedEventsRef.current = false;
    await flushEvents();

    try {
      onTurnSettled(await finalizeChatTurnAction({ chatId, session: session ?? null }));
    } catch (error) {
      onError(toErrorMessage(error, "Failed to save chat."));
    }
  };

  const agent = useEveAgent({
    followIdle: false,
    initialEvents: chat.events,
    initialSession: chat.session,
    resume: chat.session !== undefined,
    onError: (error) => onError(error.message),
    onEvent: (event) => {
      hasUnfinalizedEventsRef.current = true;
      eventBufferRef.current.push({ event, index: nextEventIndexRef.current });
      nextEventIndexRef.current += 1;

      if (flushTimerRef.current !== null) {
        window.clearTimeout(flushTimerRef.current);
      }

      flushTimerRef.current = window.setTimeout(() => {
        void flushEvents();
      }, EVENT_FLUSH_DELAY_MS);

      if (event.type === "turn.failed") {
        onError(describeTurnFailure(event));
      }
    },
    onSessionChange: (session) => {
      // Fires on every accepted event; the chat only needs each new session id.
      if (session === undefined || session.sessionId === savedSessionIdRef.current) {
        return;
      }

      savedSessionIdRef.current = session.sessionId;
      void saveChatSessionAction({ chatId, session }).catch((error: unknown) => {
        onError(toErrorMessage(error, "Failed to save chat session."));
      });
    },
    onFinish: (snapshot) => {
      void finishTurn(snapshot.session);
    },
  });

  const view = useMemo(
    () => deriveChatView({ conversation: agent.conversation, status: agent.status }),
    [agent.conversation, agent.status],
  );
  // send() reads these after its awaits, when the values it closed over are stale.
  const latestRef = useRef({ enabledConnections, view });

  useLayoutEffect(() => {
    latestRef.current = { enabledConnections, view };
  });

  useEffect(() => {
    return () => {
      void flushEvents();
    };
  }, [flushEvents]);

  const agentSend = agent.send;
  const send = useCallback(
    async (text: string, attachments: readonly Attachment[]): Promise<boolean> => {
      if (latestRef.current.view.isResuming) {
        return false;
      }

      setPreparing({ attachments, text });

      try {
        const limit = await checkSendLimitAction({ message: text });

        if (!limit.allowed) {
          onError(`${limit.message} Retry in ${limit.retryAfter}s.`);
          return false;
        }

        // Bumps the chat in the sidebar and titles a new chat from its first
        // message. An attachment-only send has no text to save.
        if (text.trim().length > 0) {
          onTurnSettled(await markChatPendingMessageAction({ chatId, message: text }));
        }

        const hostedImageUrls = await uploadImages(attachments);

        if (text.startsWith("/") && skillsRef.current === null) {
          try {
            skillsRef.current = await listSkillsAction();
          } catch {
            // The skill catalog is best-effort; the raw command still sends.
          }
        }

        const latest = latestRef.current;

        // Drop the local bubble before eve projects its optimistic one, so the
        // two never paint together.
        flushSync(() => setPreparing(null));
        await agentSend(buildMessageContent(text, attachments), {
          clientContext: buildTurnClientContext({
            enabled: latest.enabledConnections,
            hostedImageUrls,
            message: text,
            skills: skillsRef.current,
          }),
          turnPolicy: latest.view.isBusy ? "steer" : undefined,
        });

        return true;
      } finally {
        setPreparing(null);
      }
    },
    [agentSend, chatId, onError, onTurnSettled],
  );

  const agentRespond = agent.respond;
  const respond = useCallback(
    async (responses: readonly InputResponse[]) => {
      try {
        const limit = await checkSendLimitAction();

        if (!limit.allowed) {
          onError(`${limit.message} Retry in ${limit.retryAfter}s.`);
          return;
        }

        await agentRespond(responses);
      } catch (error) {
        onError(toErrorMessage(error, "Failed to send response."));
      }
    },
    [agentRespond, onError],
  );

  const agentCancel = agent.cancel;
  const cancel = useCallback(async () => {
    if (isCancellingRef.current) {
      return;
    }

    isCancellingRef.current = true;
    setIsCancelling(true);

    try {
      await agentCancel();
    } catch (error) {
      onError(toErrorMessage(error, "Failed to stop the response."));
    } finally {
      isCancellingRef.current = false;
      setIsCancelling(false);
    }
  }, [agentCancel, onError]);

  const agentMessages = agent.data.messages;
  const messages = useMemo(
    () =>
      preparing === null
        ? agentMessages
        : [
            ...agentMessages,
            createLocalUserMessage(
              `${chatId}:preparing`,
              summarizeMessage(preparing.text, preparing.attachments),
            ),
          ],
    [agentMessages, chatId, preparing],
  );

  return {
    ...view,
    cancel,
    error: agent.error,
    isBusy: view.isBusy || preparing !== null,
    isCancelling,
    messages,
    respond,
    send,
    status: agent.status,
  };
}

/** A user bubble for a message eve has not received yet. */
export function createLocalUserMessage(id: string, text: string): EveMessage {
  return {
    id,
    metadata: { optimistic: true, status: "submitted" },
    parts: [{ state: "done", text, type: "text" }],
    role: "user",
  };
}

// Matches eve's optimistic summary, so attachment chips stay put when eve's
// bubble replaces the local one.
function summarizeMessage(text: string, attachments: readonly Attachment[]) {
  return [text, ...attachments.map((attachment) => `[file: ${attachment.filename}]`)]
    .filter((line) => line.length > 0)
    .join("\n");
}

// Hosts attached images so generate_image can edit them by URL: a tool cannot
// read the uploaded bytes. Failed uploads are skipped.
async function uploadImages(attachments: readonly Attachment[]): Promise<string[]> {
  const urls = await Promise.all(
    attachments
      .filter((attachment) => attachment.mediaType.startsWith("image/"))
      .map(async (image) => {
        try {
          const result = await uploadImageAction({ dataUrl: image.data });

          return result.ok ? (result.url ?? null) : null;
        } catch {
          return null;
        }
      }),
  );

  return urls.filter((url): url is string => url !== null);
}

function describeTurnFailure(event: Extract<MessageStreamEvent, { type: "turn.failed" }>) {
  return event.data.code === "MODEL_CALL_FAILED"
    ? "The model is temporarily unavailable. Please try again."
    : event.data.message;
}

function toErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}
