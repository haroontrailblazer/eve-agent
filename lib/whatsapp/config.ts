// WhatsApp Cloud API settings. All four WHATSAPP_* values must be present for
// the channel to be configured; a missing one leaves the whole channel off.
// HARPY_WHATSAPP_NUMBER is the number people message (used for wa.me links);
// HARPY_WHATSAPP_ALLOWED_NUMBERS optionally limits who may link.

type Env = Readonly<Record<string, string | undefined>>;

// Matches the adapter's default Graph API version.
export const WHATSAPP_GRAPH_VERSION = "v25.0";

export type WhatsAppConfig = {
  readonly accessToken: string;
  readonly appSecret: string;
  readonly phoneNumberId: string;
  readonly verifyToken: string;
  readonly displayNumber: string | null;
};

export function normalizeWaNumber(value: string): string | null {
  const digits = value.replace(/\D/g, "");

  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

function trimmed(value: string | undefined): string | null {
  const result = value?.trim();

  return result ? result : null;
}

export function getWhatsAppConfig(env: Env = process.env): WhatsAppConfig | null {
  const accessToken = trimmed(env.WHATSAPP_ACCESS_TOKEN);
  const appSecret = trimmed(env.WHATSAPP_APP_SECRET);
  const phoneNumberId = trimmed(env.WHATSAPP_PHONE_NUMBER_ID);
  const verifyToken = trimmed(env.WHATSAPP_VERIFY_TOKEN);

  if (!accessToken || !appSecret || !phoneNumberId || !verifyToken) {
    return null;
  }

  const number = trimmed(env.HARPY_WHATSAPP_NUMBER);

  return {
    accessToken,
    appSecret,
    phoneNumberId,
    verifyToken,
    displayNumber: number ? normalizeWaNumber(number) : null,
  };
}

export function isWhatsAppConfigured(env: Env = process.env): boolean {
  return getWhatsAppConfig(env) !== null;
}

export function getAllowedWhatsAppNumbers(env: Env = process.env): readonly string[] {
  const numbers = (env.HARPY_WHATSAPP_ALLOWED_NUMBERS ?? "")
    .split(",")
    .map(normalizeWaNumber)
    .filter((number): number is string => number !== null);

  return [...new Set(numbers)];
}

export function waMeLink(displayNumber: string, text: string): string {
  return `https://wa.me/${displayNumber}?text=${encodeURIComponent(text)}`;
}
