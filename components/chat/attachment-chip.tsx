"use client";

import {
  FileCodeIcon,
  FileIcon,
  FileJsonIcon,
  FileTextIcon,
  ImageIcon,
  XIcon,
} from "lucide-react";
import type { ComponentType } from "react";
import { cn } from "@/lib/utils";

const CODE_EXTS = new Set([
  "c", "cjs", "cpp", "cs", "css", "go", "html", "java", "js", "jsx", "kt",
  "mjs", "php", "py", "rb", "rs", "sh", "sql", "swift", "toml", "ts", "tsx",
  "xml", "yaml", "yml",
]);

type Icon = ComponentType<{ readonly className?: string }>;

function iconFor(name: string, mediaType: string): Icon {
  const type = mediaType.toLowerCase();
  const ext = name.split(".").pop()?.toLowerCase() ?? "";

  if (type.startsWith("image/")) {
    return ImageIcon;
  }

  if (type === "application/json" || ext === "json") {
    return FileJsonIcon;
  }

  if (CODE_EXTS.has(ext)) {
    return FileCodeIcon;
  }

  if (type === "application/pdf" || type.startsWith("text/") || ext === "pdf" || ext === "md" || ext === "txt") {
    return FileTextIcon;
  }

  return FileIcon;
}

// A clean, file-type-aware attachment chip — shared by the composer (removable)
// and the sent message bubble (read-only), so both render attachments the same
// claude.ai-style way.
export function AttachmentChip({
  className,
  mediaType,
  name,
  onRemove,
  removeLabel,
}: {
  readonly className?: string;
  readonly mediaType: string;
  readonly name: string;
  readonly onRemove?: () => void;
  readonly removeLabel?: string;
}) {
  const Icon = iconFor(name, mediaType);

  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-lg border border-border/60 bg-background/70 px-2 py-1 text-xs text-foreground",
        className,
      )}
    >
      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate">{name}</span>
      {onRemove ? (
        <button
          aria-label={removeLabel ?? `Remove ${name}`}
          className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
          onClick={onRemove}
          type="button"
        >
          <XIcon className="size-3" />
        </button>
      ) : null}
    </span>
  );
}
