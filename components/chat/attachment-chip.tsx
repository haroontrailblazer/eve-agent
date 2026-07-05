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
  readonly tile: string;
};

function metaFor(name: string, mediaType: string): ChipMeta {
  const type = mediaType.toLowerCase();
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  const extLabel = ext ? ext.toUpperCase() : "";

  if (type.startsWith("image/")) {
    return { Icon: ImageIcon, label: extLabel || "IMAGE", tile: "bg-sky-500/15 text-sky-500" };
  }

  if (type === "application/pdf" || ext === "pdf") {
    return { Icon: FileTextIcon, label: "PDF", tile: "bg-rose-500/15 text-rose-500" };
  }

  if (type === "application/json" || ext === "json") {
    return { Icon: FileJsonIcon, label: "JSON", tile: "bg-amber-500/15 text-amber-600 dark:text-amber-500" };
  }

  if (CODE_EXTS.has(ext)) {
    return { Icon: FileCodeIcon, label: extLabel || "CODE", tile: "bg-violet-500/15 text-violet-500" };
  }

  if (type.startsWith("text/") || ext === "md" || ext === "txt") {
    return { Icon: FileTextIcon, label: extLabel || "TEXT", tile: "bg-blue-500/15 text-blue-500" };
  }

  return { Icon: FileIcon, label: extLabel || "FILE", tile: "bg-muted text-muted-foreground" };
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
}: {
  readonly className?: string;
  readonly file?: File;
  readonly mediaType: string;
  readonly name: string;
  readonly onRemove?: () => void;
  readonly removeLabel?: string;
}) {
  const meta = metaFor(name, mediaType);
  const isImage = mediaType.toLowerCase().startsWith("image/");
  const previewUrl = useImagePreview(file, isImage);
  const subtitle = file ? `${meta.label} · ${formatBytes(file.size)}` : meta.label;

  return (
    <span
      className={cn(
        "relative inline-flex w-[15rem] max-w-full items-center gap-2.5 rounded-xl border border-border/60 bg-background/80 py-1.5 pr-2.5 pl-1.5 shadow-sm",
        className,
      )}
    >
      <span
        className={cn(
          "flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg",
          previewUrl ? "bg-muted" : meta.tile,
        )}
      >
        {previewUrl ? (
          // Local thumbnail preview of the attached image.
          // eslint-disable-next-line @next/next/no-img-element
          <img alt="" className="size-full object-cover" src={previewUrl} />
        ) : (
          <meta.Icon className="size-4" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium leading-4 text-foreground">
          {name}
        </span>
        <span className="block truncate text-[11px] leading-4 text-muted-foreground">
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
