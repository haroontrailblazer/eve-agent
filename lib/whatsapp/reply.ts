import { getAppOrigin } from "@/lib/app-origin";
import { isPublicBlobUrl } from "@/lib/media/source-url";

const IMAGE = /!\[[^\]]*\]\(\s*([^)\s]+)[^)]*\)/g;
const LINK = /\[([^\]]+)\]\(\s*([^)\s]+)[^)]*\)/g;

function isAppUrl(raw: string): boolean {
  try {
    return new URL(raw).origin === getAppOrigin();
  } catch {
    return false;
  }
}

function defaultAllowed(url: string): boolean {
  return isPublicBlobUrl(url) || isAppUrl(url);
}

// WhatsApp renders neither markdown images nor links. Images go out as their own
// messages; links become plain text.
export function formatWhatsAppReply(
  markdown: string,
  isAllowedImageUrl: (url: string) => boolean = defaultAllowed,
): { readonly text: string; readonly imageUrls: readonly string[] } {
  const imageUrls: string[] = [];
  const withoutImages = markdown.replace(IMAGE, (_match, url: string) => {
    if (isAllowedImageUrl(url)) imageUrls.push(url);
    return "";
  });
  const text = withoutImages
    .replace(LINK, (_match, label: string, url: string) => (label === url ? url : `${label}: ${url}`))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { text, imageUrls };
}

// The channel state key holding the turn whose tool-call line already went out.
export const TOOL_LINE_TURN_STATE_KEY = "toolLineTurnId";

export type WhatsAppReplyPlan = {
  readonly reply: { readonly text: string; readonly imageUrls: readonly string[] } | null;
  // What to store under TOOL_LINE_TURN_STATE_KEY.
  readonly toolLineTurnId: string | null;
};

// Which completed assistant messages reach WhatsApp. A final message always
// does. Of the messages the model writes before a tool call, only the first
// non-empty one in a turn does: the short line before drafting. WhatsApp shows
// no typing text, so without it the owner hears nothing until drafting ends.
export function planWhatsAppReply(
  event: { readonly finishReason: string; readonly message: string; readonly turnId: string },
  storedToolLineTurnId: unknown,
  isAllowedImageUrl: (url: string) => boolean = defaultAllowed,
): WhatsAppReplyPlan {
  const posted = typeof storedToolLineTurnId === "string" ? storedToolLineTurnId : null;
  const isToolLine = event.finishReason === "tool-calls";
  if (isToolLine && posted === event.turnId) return { reply: null, toolLineTurnId: posted };

  const reply = formatWhatsAppReply(event.message, isAllowedImageUrl);
  if (!reply.text && reply.imageUrls.length === 0) return { reply: null, toolLineTurnId: posted };
  return { reply, toolLineTurnId: isToolLine ? event.turnId : posted };
}
