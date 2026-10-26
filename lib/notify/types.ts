export type NotificationKind = "drafts_ready";
export type NotificationStatus = "pending" | "sent" | "failed";
export type NotificationDelivery = "service" | "template";

export type NotificationPayload = {
  readonly kind: "drafts_ready";
  readonly ideaId: string;
  readonly drafts: readonly { readonly id: string; readonly revision: number }[];
};

export type NotificationRecord = {
  readonly id: string;
  readonly brandId: string;
  readonly channel: "whatsapp";
  readonly recipient: string;
  readonly kind: NotificationKind;
  readonly dedupeKey: string;
  readonly payload: NotificationPayload;
  readonly status: NotificationStatus;
  readonly delivery: NotificationDelivery | null;
  readonly providerMessageId: string | null;
  readonly attempts: number;
  readonly lastError: string | null;
  readonly createdAt: string;
};
