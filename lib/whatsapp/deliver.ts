// Review delivery through the notification outbox: cards while the 24-hour
// window is open, the harpy_drafts_ready template when it is closed or Meta
// rejects a card with 131047.

import { createHash } from "node:crypto";
import { getBrandSettings } from "@/lib/db/brands";
import type { DraftRecord } from "@/lib/drafts/records";
import { getIdea, listDraftsForIdea } from "@/lib/drafts/store";
import { getMediaAsset } from "@/lib/media/assets";
import {
  claimFailedNotification,
  insertNotification,
  markNotificationFailed,
  markNotificationSent,
  recordWaMessage,
} from "@/lib/notify/store";
import type { NotificationRecord } from "@/lib/notify/types";
import { isValidTimeZone } from "@/lib/time-zone";
import { harpyActionId, reviewCardMessages } from "@/lib/whatsapp/cards";
import { sendWhatsApp, type WhatsAppSendResult } from "@/lib/whatsapp/cloud-api";
import { getWhatsAppConfig } from "@/lib/whatsapp/config";
import { templateMessage, templateParam } from "@/lib/whatsapp/templates";
import { isWindowOpen } from "@/lib/whatsapp/window";

const SEND_FAILED_MESSAGE = "Couldn't reach WhatsApp. Try again in a minute.";
const IDEA_PARAM_MAX = 60;

export type CardSendOutcome = {
  readonly sent: number;
  readonly windowClosed: boolean;
  readonly error: string | null;
  // The wamid of the last message that went out, recorded on the notification.
  readonly lastWamid: string | null;
};

export async function sendReviewCards(input: {
  readonly brandId: string;
  readonly waId: string;
  readonly drafts: readonly DraftRecord[];
  readonly notificationId: string | null;
}): Promise<CardSendOutcome> {
  const { brandId, waId, drafts, notificationId } = input;
  const settings = await getBrandSettings(brandId);
  const timezone = settings && isValidTimeZone(settings.timezone) ? settings.timezone : "UTC";

  let sent = 0;
  let lastWamid: string | null = null;
  for (const draft of drafts) {
    const firstMediaId = draft.mediaIds[0];
    const asset = firstMediaId ? await getMediaAsset(firstMediaId) : null;
    const imageUrl = asset && asset.brandId === brandId ? asset.blobUrl : null;

    for (const { kind, message } of reviewCardMessages({ waId, draft, imageUrl, timezone })) {
      const result = await sendWhatsApp(message);
      if (!result.ok) {
        return {
          sent,
          windowClosed: result.windowClosed,
          error: result.windowClosed ? null : result.message,
          lastWamid,
        };
      }
      lastWamid = result.wamid;
      sent += 1;
      await recordWaMessage({
        brandId,
        wamid: result.wamid,
        draftId: draft.id,
        revision: draft.revision,
        kind,
        notificationId,
        recipient: waId,
      });
    }
  }

  return { sent, windowClosed: false, error: null, lastWamid };
}

export type NotifyResult =
  | { readonly ok: true; readonly delivery: "cards" | "template" | "duplicate"; readonly sent: number }
  | {
      readonly ok: false;
      readonly reason: "not_configured" | "nothing_to_review" | "send_failed";
      readonly message: string;
    };

export async function sendDraftsReadyTemplate(notification: NotificationRecord): Promise<WhatsAppSendResult> {
  const { ideaId, drafts } = notification.payload;
  const idea = await getIdea(notification.brandId, ideaId);

  return sendWhatsApp(
    templateMessage({
      waId: notification.recipient,
      name: "harpy_drafts_ready",
      params: [String(drafts.length), templateParam(idea?.text ?? "", IDEA_PARAM_MAX) || "your latest idea"],
      payloads: [harpyActionId({ verb: "review", ideaId })],
    }),
  );
}

export async function notifyDraftsReady(input: {
  readonly brandId: string;
  readonly waId: string;
  readonly ideaId: string;
  readonly draftIds?: readonly string[];
  readonly resendKey?: string;
}): Promise<NotifyResult> {
  const { brandId, waId, ideaId, draftIds, resendKey } = input;

  if (!getWhatsAppConfig()) {
    return { ok: false, reason: "not_configured", message: "WhatsApp isn't set up for harpy yet." };
  }

  const wanted = draftIds ? new Set(draftIds) : null;
  const drafts = (await listDraftsForIdea(brandId, ideaId)).filter(
    (draft) => draft.status === "pending_review" && (!wanted || wanted.has(draft.id)),
  );
  if (drafts.length === 0) {
    return { ok: false, reason: "nothing_to_review", message: "There are no drafts waiting for review." };
  }

  const revisions = drafts
    .map((draft) => `${draft.id}@${draft.revision}`)
    .sort()
    .join(",");
  const digest = createHash("sha256")
    .update(`${waId}|${ideaId}|${revisions}${resendKey ? `|${resendKey}` : ""}`)
    .digest("hex");

  const inserted = await insertNotification({
    brandId,
    recipient: waId,
    kind: "drafts_ready",
    dedupeKey: `drafts_ready:${digest}`,
    payload: { kind: "drafts_ready", ideaId, drafts: drafts.map((draft) => ({ id: draft.id, revision: draft.revision })) },
  });
  let notification = inserted.notification;
  if (!inserted.created) {
    // A failed notification keeps its dedupe key; a retry takes it back.
    const claimed = notification.status === "failed" ? await claimFailedNotification(notification.id) : null;
    if (!claimed) return { ok: true, delivery: "duplicate", sent: 0 };
    notification = claimed;
  }

  try {
    return await deliver({ brandId, waId, drafts, notification });
  } catch (error) {
    await markNotificationFailed({
      id: notification.id,
      error: error instanceof Error ? error.message : "Delivery failed.",
    });
    return { ok: false, reason: "send_failed", message: SEND_FAILED_MESSAGE };
  }
}

async function deliver(input: {
  readonly brandId: string;
  readonly waId: string;
  readonly drafts: readonly DraftRecord[];
  readonly notification: NotificationRecord;
}): Promise<NotifyResult> {
  const { brandId, waId, drafts, notification } = input;
  if (await isWindowOpen(waId)) {
    const outcome = await sendReviewCards({ brandId, waId, drafts, notificationId: notification.id });
    if (!outcome.windowClosed) {
      if (outcome.error !== null) {
        await markNotificationFailed({ id: notification.id, error: outcome.error });
        return { ok: false, reason: "send_failed", message: SEND_FAILED_MESSAGE };
      }
      await markNotificationSent({ id: notification.id, delivery: "service", providerMessageId: outcome.lastWamid });
      return { ok: true, delivery: "cards", sent: outcome.sent };
    }
  }

  const template = await sendDraftsReadyTemplate(notification);
  if (!template.ok) {
    await markNotificationFailed({ id: notification.id, error: template.message });
    return { ok: false, reason: "send_failed", message: SEND_FAILED_MESSAGE };
  }
  await markNotificationSent({ id: notification.id, delivery: "template", providerMessageId: template.wamid });
  return { ok: true, delivery: "template", sent: 1 };
}
