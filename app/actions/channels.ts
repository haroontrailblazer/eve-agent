"use server";

import QRCode from "qrcode";
import { z } from "zod";
import { BrandAccessError, getBrandIdForUser } from "@/lib/brand-access";
import { linkedRow, type LinkedRow } from "@/lib/channels/view";
import { listIdentitiesForBrand, unlinkIdentity } from "@/lib/db/channel-identities";
import { LinkCodeUnavailableError, createLinkCode } from "@/lib/link-codes";
import { RateLimitError } from "@/lib/rate-limit";
import { getServerViewer } from "@/lib/session";
import { getWhatsAppConfig, waMeLink } from "@/lib/whatsapp/config";

type Failure = { readonly ok: false; readonly message: string };

const SIGN_IN_MESSAGE = "Sign in with Vercel to continue.";

const channelInput = z.object({ channel: z.enum(["whatsapp", "slack"]) });
const unlinkInput = z.object({ id: z.string().min(1).max(100) });

// The signed-in viewer and their brand, or the message to show instead.
async function context() {
  const viewer = await getServerViewer();

  if (!viewer) {
    return { ok: false, message: SIGN_IN_MESSAGE } as const;
  }

  try {
    return { ok: true, viewer, brandId: await getBrandIdForUser(viewer) } as const;
  } catch (error) {
    if (error instanceof BrandAccessError) {
      return { ok: false, message: error.message } as const;
    }

    throw error;
  }
}

export async function listLinkedChannelsAction(): Promise<
  | { ok: true; whatsappConfigured: boolean; slackConfigured: boolean; rows: LinkedRow[] }
  | Failure
> {
  const ctx = await context();
  if (!ctx.ok) return ctx;

  const identities = await listIdentitiesForBrand(ctx.brandId);

  return {
    ok: true,
    whatsappConfigured: getWhatsAppConfig() !== null,
    slackConfigured: Boolean(process.env.SLACK_CONNECTOR),
    rows: identities.map(linkedRow),
  };
}

export async function createLinkCodeAction(input: {
  channel: "whatsapp" | "slack";
}): Promise<
  | { ok: true; code: string; expiresAt: string; waLink: string | null; qrSvg: string | null }
  | Failure
> {
  const ctx = await context();
  if (!ctx.ok) return ctx;

  const parsed = channelInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: "That request is not valid." };

  const { channel } = parsed.data;

  try {
    const { code, expiresAt } = await createLinkCode({
      userId: ctx.viewer.id,
      brandId: ctx.brandId,
      channel,
    });

    const displayNumber = channel === "whatsapp" ? (getWhatsAppConfig()?.displayNumber ?? null) : null;
    const waLink = displayNumber ? waMeLink(displayNumber, `LINK ${code}`) : null;
    // The link is digits plus an encoded code, so the SVG holds no user input.
    const qrSvg = waLink ? await QRCode.toString(waLink, { type: "svg", margin: 1 }) : null;

    return { ok: true, code, expiresAt, waLink, qrSvg };
  } catch (error) {
    if (error instanceof LinkCodeUnavailableError) {
      return { ok: false, message: "Linking needs Redis, which isn't set up." };
    }

    if (error instanceof RateLimitError) {
      return { ok: false, message: "Too many codes. Try again in an hour." };
    }

    throw error;
  }
}

export async function unlinkChannelAction(input: { id: string }): Promise<{ ok: true } | Failure> {
  const ctx = await context();
  if (!ctx.ok) return ctx;

  const parsed = unlinkInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: "That request is not valid." };

  const removed = await unlinkIdentity(ctx.brandId, parsed.data.id);
  return removed ? { ok: true } : { ok: false, message: "That link is already gone." };
}
