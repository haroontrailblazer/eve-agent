import type { UserContent } from "ai";

// A serializable file attachment (an AI SDK file part). `data` is a base64
// `data:` URL so it survives JSON + sessionStorage (used to carry attachments
// across the hero → chat navigation).
export type Attachment = {
  readonly type: "file";
  readonly data: string;
  readonly mediaType: string;
  readonly filename: string;
};

// Lightweight metadata (no base64 payload) used to render clean attachment
// chips in the sent message bubble — eve's message reducer drops file parts,
// so the UI tracks these itself.
export type AttachmentMeta = {
  readonly name: string;
  readonly mediaType: string;
};

export function toAttachmentMeta(attachments: readonly Attachment[]): AttachmentMeta[] {
  return attachments.map((attachment) => ({
    mediaType: attachment.mediaType,
    name: attachment.filename,
  }));
}

// eve's message reducer renders a sent file part as a text placeholder:
// `[file: name (mediaType)]` (wire summary) or `[file: name]` / `[file]`
// (client reducer). We parse these back into chips and strip them from the
// visible text so the bubble stays clean — and so the sent-vs-displayed text
// comparison that clears the optimistic "Thinking…" state still matches.
const INLINE_FILE_RE = /\[file(?::\s*([^\][]*?))?\]/g;

function splitNameAndType(raw: string): AttachmentMeta {
  const match = raw.match(/^(.*?)\s*\(([^()]+)\)\s*$/);

  if (match) {
    return { mediaType: match[2].trim(), name: match[1].trim() };
  }

  return { mediaType: "", name: raw.trim() };
}

export function parseInlineAttachments(text: string): AttachmentMeta[] {
  const attachments: AttachmentMeta[] = [];

  for (const match of text.matchAll(INLINE_FILE_RE)) {
    const raw = (match[1] ?? "").trim();
    attachments.push(raw ? splitNameAndType(raw) : { mediaType: "", name: "File" });
  }

  return attachments;
}

export function stripInlineAttachments(text: string): string {
  return text
    .replace(INLINE_FILE_RE, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

const EXT_MEDIA_TYPES: Record<string, string> = {
  css: "text/css",
  csv: "text/csv",
  html: "text/html",
  json: "application/json",
  md: "text/markdown",
  txt: "text/plain",
  xml: "text/xml",
  yaml: "text/yaml",
  yml: "text/yaml",
};
const TEXT_CODE_EXTS = new Set([
  "c", "cjs", "cpp", "cs", "go", "java", "js", "jsx", "kt", "mjs", "php", "py",
  "rb", "rs", "sh", "sql", "swift", "toml", "ts", "tsx",
]);

function detectMediaType(file: File): string {
  if (file.type) {
    return file.type;
  }
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (EXT_MEDIA_TYPES[ext]) {
    return EXT_MEDIA_TYPES[ext];
  }
  if (TEXT_CODE_EXTS.has(ext)) {
    return "text/plain";
  }
  return "application/octet-stream";
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export async function filesToAttachments(files: readonly File[]): Promise<Attachment[]> {
  return Promise.all(
    files.map(async (file) => ({
      data: await readFileAsDataUrl(file),
      filename: file.name,
      mediaType: detectMediaType(file),
      type: "file" as const,
    })),
  );
}

// Build the message content for agent.send: plain text when there are no
// attachments, otherwise a UserContent array of a text part plus file parts.
export function buildMessageContent(
  text: string,
  attachments?: readonly Attachment[],
): string | UserContent {
  if (!attachments || attachments.length === 0) {
    return text;
  }

  const parts: UserContent = [
    ...(text ? [{ text, type: "text" as const }] : []),
    ...attachments.map((attachment) => ({
      data: attachment.data,
      filename: attachment.filename,
      mediaType: attachment.mediaType,
      type: "file" as const,
    })),
  ];

  return parts;
}

const pendingKey = (chatId: string) => `harpy-pending-attachments:${chatId}`;

export function writePendingAttachments(
  chatId: string,
  attachments: readonly Attachment[],
): boolean {
  if (attachments.length === 0) {
    return true;
  }
  try {
    window.sessionStorage.setItem(pendingKey(chatId), JSON.stringify(attachments));
    return true;
  } catch {
    // sessionStorage full (large files) or unavailable.
    return false;
  }
}

export function readPendingAttachments(chatId: string): Attachment[] {
  try {
    const raw = window.sessionStorage.getItem(pendingKey(chatId));
    if (!raw) {
      return [];
    }
    window.sessionStorage.removeItem(pendingKey(chatId));
    return JSON.parse(raw) as Attachment[];
  } catch {
    return [];
  }
}
