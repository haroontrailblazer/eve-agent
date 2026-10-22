import { getAppOrigin } from "@/lib/app-origin";

// Decides whether a url the model hands to generate_image may be fetched. Only
// two kinds pass: harpy's own /api/images/<uuid> route and public Vercel Blob
// urls. Everything else (other hosts, internal addresses, data: and file: urls)
// is refused, so the tool cannot be pointed at arbitrary addresses (SSRF).

export type SourceUrlCheck =
  | { readonly ok: true; readonly kind: "app-image"; readonly id: string }
  | { readonly ok: true; readonly kind: "blob"; readonly url: URL }
  | { readonly ok: false; readonly reason: string };

const MAX_URL_LENGTH = 2048;
const UUID_PATTERN = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const UUID_RE = new RegExp(`^${UUID_PATTERN}$`, "i");
const APP_IMAGE_PATH_RE = new RegExp(`^/api/images/(${UUID_PATTERN})$`, "i");
const PUBLIC_BLOB_HOST_RE = /^[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export function checkSourceImageUrl(raw: string, appOrigin: string = getAppOrigin()): SourceUrlCheck {
  const trimmed = raw.trim();

  if (trimmed.length === 0 || trimmed.length > MAX_URL_LENGTH) {
    return reject("The image url is empty or too long.");
  }

  const origin = new URL(appOrigin);
  let url: URL;

  try {
    url = new URL(trimmed, origin);
  } catch {
    return reject("The image url is not a valid url.");
  }

  if (url.username || url.password) {
    return reject("Image urls with credentials are not allowed.");
  }

  if (url.origin === origin.origin) {
    const match = url.pathname.match(APP_IMAGE_PATH_RE);

    return match && url.search === ""
      ? { id: match[1]!, kind: "app-image", ok: true }
      : reject("Only harpy image urls (/api/images/<id>) are allowed on this origin.");
  }

  return checkBlobUrl(url);
}

export function isPublicBlobUrl(raw: string): boolean {
  const trimmed = raw.trim();

  if (trimmed.length === 0 || trimmed.length > MAX_URL_LENGTH) {
    return false;
  }

  let url: URL;

  try {
    url = new URL(trimmed);
  } catch {
    return false;
  }

  if (url.username || url.password) {
    return false;
  }

  return checkBlobUrl(url).ok;
}

function checkBlobUrl(url: URL): SourceUrlCheck {
  if (url.protocol !== "https:" || url.port !== "") {
    return reject("Image urls must use https on the default port.");
  }

  if (!PUBLIC_BLOB_HOST_RE.test(url.hostname)) {
    return reject("Only harpy image urls and public Vercel Blob urls are allowed.");
  }

  return { kind: "blob", ok: true, url };
}

function reject(reason: string): SourceUrlCheck {
  return { ok: false, reason };
}
