// WhatsApp Cloud API sender. Takes a message body without messaging_product
// and posts it to the Graph API; fetch and config are injectable for tests.

import { getWhatsAppConfig, WHATSAPP_GRAPH_VERSION, type WhatsAppConfig } from "@/lib/whatsapp/config";

// "Re-engagement message": the 24-hour customer service window is closed.
export const WINDOW_CLOSED_CODE = 131047;

export type WhatsAppOutbound = Readonly<Record<string, unknown>>;

export type WhatsAppSendResult =
  | { readonly ok: true; readonly wamid: string }
  | {
      readonly ok: false;
      readonly code: number | null;
      readonly windowClosed: boolean;
      readonly message: string;
    };

// Business-scoped user ids look like "US.1349..." or "US.ENT.1349...".
const BSUID = /^[A-Z]{2}\.(?:ENT\.)?[A-Za-z0-9]{1,128}$/;

export function isBsuid(value: string): boolean {
  return BSUID.test(value);
}

export function recipientFields(waId: string): { readonly to: string } | { readonly recipient: string } {
  return isBsuid(waId) ? { recipient: waId } : { to: waId };
}

export function textMessage(waId: string, body: string): WhatsAppOutbound {
  return { ...recipientFields(waId), type: "text", text: { preview_url: false, body } };
}

function failure(code: number | null, message: string): WhatsAppSendResult {
  return { ok: false, code, windowClosed: code === WINDOW_CLOSED_CODE, message };
}

export async function sendWhatsApp(
  message: WhatsAppOutbound,
  options: { readonly config?: WhatsAppConfig | null; readonly fetch?: typeof fetch } = {},
): Promise<WhatsAppSendResult> {
  const config = options.config === undefined ? getWhatsAppConfig() : options.config;
  if (!config) return failure(null, "WhatsApp is not set up.");

  const doFetch = options.fetch ?? fetch;
  const url = `https://graph.facebook.com/${WHATSAPP_GRAPH_VERSION}/${config.phoneNumberId}/messages`;

  try {
    const response = await doFetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", ...message }),
    });
    const payload = (await response.json().catch(() => null)) as {
      messages?: { id?: string }[];
      error?: { code?: number; message?: string };
    } | null;

    if (response.ok) {
      const wamid = payload?.messages?.[0]?.id;
      return wamid ? { ok: true, wamid } : failure(null, "WhatsApp returned no message id.");
    }

    return failure(
      typeof payload?.error?.code === "number" ? payload.error.code : null,
      payload?.error?.message ?? `WhatsApp request failed (${response.status}).`,
    );
  } catch (error) {
    return failure(null, error instanceof Error ? error.message : "WhatsApp request failed.");
  }
}
