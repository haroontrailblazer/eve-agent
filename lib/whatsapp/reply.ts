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
