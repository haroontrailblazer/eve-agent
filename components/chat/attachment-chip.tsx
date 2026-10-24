"use client";

import {
  FileCodeIcon,
  FileIcon,
  FileJsonIcon,
  FileTextIcon,
  ImageIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useState, type ComponentType } from "react";
import { cn } from "@/lib/utils";

const CODE_EXTS = new Set([
  "c", "cjs", "cpp", "cs", "css", "go", "html", "java", "js", "jsx", "kt",
  "mjs", "php", "py", "rb", "rs", "sh", "sql", "swift", "toml", "ts", "tsx",
  "xml", "yaml", "yml",
]);

type ChipMeta = {
  readonly Icon: ComponentType<{ readonly className?: string }>;
  readonly label: string;
};

function metaFor(name: string, mediaType: string): ChipMeta {
  const type = mediaType.toLowerCase();
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const extLabel = ext ? ext.toUpperCase() : "";

  if (type.startsWith("image/")) {
    return { Icon: ImageIcon, label: extLabel || "IMAGE" };
  }

  if (type === "application/pdf" || ext === "pdf") {
    return { Icon: FileTextIcon, label: "PDF" };
  }

  if (type === "application/json" || ext === "json") {
    return { Icon: FileJsonIcon, label: "JSON" };
  }

  if (CODE_EXTS.has(ext)) {
    return { Icon: FileCodeIcon, label: extLabel || "CODE" };
  }

  if (type.startsWith("text/") || ext === "md" || ext === "txt") {
    return { Icon: FileTextIcon, label: extLabel || "TEXT" };
  }

  return { Icon: FileIcon, label: extLabel || "FILE" };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Local object URL for an image File, revoked on unmount so we don't leak.
function useImagePreview(file: File | undefined, isImage: boolean) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file || !isImage) {
      setUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);

    return () => URL.revokeObjectURL(objectUrl);
  }, [file, isImage]);

  return url;
}

// A claude.ai-style file card — shared by the composer (removable, with an
// image thumbnail and size when the File is on hand) and the sent message
// bubble (read-only, icon tile) so attachments look identical everywhere.
export function AttachmentChip({
  className,
  file,
  mediaType,
  name,
  onRemove,
  removeLabel,
  url,
}: {
  readonly className?: string;
  readonly file?: File;
  readonly mediaType: string;
  readonly name: string;
  readonly onRemove?: () => void;
  readonly removeLabel?: string;
  readonly url?: string;
}) {
  const meta = metaFor(name, mediaType);
  const isImage = mediaType.toLowerCase().startsWith("image/");
  const previewUrl = useImagePreview(file, isImage);
  // Prefer a live File thumbnail (composer); fall back to a provided url (the
  // sent bubble, in-session) so attached images show as images, not just icons.
  const thumbnailSrc = previewUrl ?? (isImage ? url ?? null : null);
  const subtitle = file ? `${meta.label} · ${formatBytes(file.size)}` : meta.label;

  return (
    <span
      className={cn(
        "relative inline-flex w-60 max-w-full items-center gap-2.5 rounded-xl border border-border/60 bg-background/80 py-1.5 pr-2.5 pl-1.5 shadow-sm",
        className,
      )}
    >
      <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted text-muted-foreground">
        {thumbnailSrc ? (
          // Thumbnail preview of the attached image.
          // eslint-disable-next-line @next/next/no-img-element
          <img alt="" className="size-full object-cover" src={thumbnailSrc} />
        ) : (
          <meta.Icon className="size-4" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-small font-medium leading-4 text-foreground">
          {name}
        </span>
        <span className="block truncate font-mono text-meta leading-4 text-muted-foreground">
          {subtitle}
        </span>
      </span>
      {onRemove ? (
        <button
          aria-label={removeLabel ?? `Remove ${name}`}
          className="absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-sm transition-colors hover:text-foreground"
          onClick={onRemove}
          type="button"
        >
          <XIcon className="size-2.5" />
        </button>
      ) : null}
    </span>
  );
}
