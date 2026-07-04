"use client";

import { ArrowUpIcon, Loader2Icon, PaperclipIcon, SparklesIcon, SquareIcon } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { listSkillsAction } from "@/app/actions/skills";
import { AttachmentChip } from "@/components/chat/attachment-chip";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getChatMessageLength, MAX_CHAT_MESSAGE_CHARS } from "@/lib/chat/limits";
import { filterSkills, type SkillSummary } from "@/lib/skills/catalog";
import { cn } from "@/lib/utils";

// The composer opens a Claude-style "/" menu when the whole message is a single
// "/command" token (no spaces yet). This matches that leading token.
const SLASH_QUERY_RE = /^\/([\w-]*)$/;

const MAX_ATTACHMENT_MB = 10;
const MAX_ATTACHMENT_BYTES = MAX_ATTACHMENT_MB * 1024 * 1024;
// Paste more than this many characters and it becomes a text attachment instead
// of flooding the input — the way claude.ai handles big pastes.
const PASTE_TO_FILE_CHARS = 1800;

export function ChatComposer({
  autoFocus = true,
  className,
  disabled = false,
  disabledReason,
  footerStart,
  isBusy = false,
  isPreparing = false,
  maxLength = MAX_CHAT_MESSAGE_CHARS,
  onChange,
  onSubmit,
  placeholder = "Ask eve anything...",
  value,
}: {
  readonly autoFocus?: boolean;
  readonly className?: string;
  readonly disabled?: boolean;
  readonly disabledReason?: string;
  readonly footerStart?: ReactNode;
  readonly isBusy?: boolean;
  readonly isPreparing?: boolean;
  readonly maxLength?: number;
  readonly onChange: (value: string) => void;
  readonly onStop: () => void;
  readonly onSubmit: (value: string, files: File[]) => void | Promise<void>;
  readonly placeholder?: string;
  readonly value: string;
}) {
  const composerId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [skills, setSkills] = useState<readonly SkillSummary[]>([]);
  const [skillMenuClosed, setSkillMenuClosed] = useState(false);
  const [activeSkillIndex, setActiveSkillIndex] = useState(0);
  const skillsLoadedRef = useRef(false);
  const textareaDisabled = disabled || isBusy || isPreparing;
  const trimmedValue = value.trim();
  const isOverMaxLength = getChatMessageLength(trimmedValue) > maxLength;

  // "/" slash-command menu: open when the whole message is a single "/token".
  const slashMatch = value.match(SLASH_QUERY_RE);
  const slashQuery = slashMatch ? slashMatch[1]! : null;
  const filteredSkills = useMemo(
    () => (slashQuery === null ? [] : filterSkills(skills, slashQuery)),
    [skills, slashQuery],
  );
  const skillMenuOpen =
    slashQuery !== null && !skillMenuClosed && !textareaDisabled && filteredSkills.length > 0;

  // Lazily load the user's skills the first time they start a "/" command.
  useEffect(() => {
    if (skillsLoadedRef.current || !value.startsWith("/")) {
      return;
    }

    skillsLoadedRef.current = true;
    let cancelled = false;

    void listSkillsAction()
      .then((loaded) => {
        if (!cancelled) {
          setSkills(loaded);
        }
      })
      .catch(() => {
        skillsLoadedRef.current = false;
      });

    return () => {
      cancelled = true;
    };
  }, [value]);

  useEffect(() => {
    setActiveSkillIndex(0);
    if (slashQuery === null) {
      setSkillMenuClosed(false);
    }
  }, [slashQuery]);

  const selectSkill = useCallback(
    (skill: SkillSummary) => {
      onChange(skill.prompt);
      setSkillMenuClosed(true);
      window.requestAnimationFrame(() => {
        const textarea = textareaRef.current;

        if (textarea) {
          textarea.focus({ preventScroll: true });
          const end = textarea.value.length;
          textarea.setSelectionRange(end, end);
        }
      });
    },
    [onChange],
  );

  const addFiles = useCallback((incoming: readonly File[]) => {
    const accepted: File[] = [];
    let hasOversized = false;

    for (const file of incoming) {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        hasOversized = true;
      } else {
        accepted.push(file);
      }
    }

    setAttachmentError(hasOversized ? `Each file must be under ${MAX_ATTACHMENT_MB} MB.` : null);

    if (accepted.length > 0) {
      setFiles((current) => [...current, ...accepted]);
    }
  }, []);

  const handleFilesSelected = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      addFiles(Array.from(event.target.files ?? []));
      event.target.value = "";
    },
    [addFiles],
  );

  const handlePaste = useCallback(
    (event: ClipboardEvent<HTMLTextAreaElement>) => {
      const pastedFiles = Array.from(event.clipboardData.files ?? []);

      if (pastedFiles.length > 0) {
        event.preventDefault();
        addFiles(pastedFiles);
        return;
      }

      const text = event.clipboardData.getData("text");

      if (text.length > PASTE_TO_FILE_CHARS) {
        event.preventDefault();
        addFiles([new File([text], "Pasted text.txt", { type: "text/plain" })]);
      }
    },
    [addFiles],
  );

  const removeFile = useCallback((index: number) => {
    setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index));
  }, []);

  useEffect(() => {
    if (!autoFocus || textareaDisabled) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      textareaRef.current?.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(frame);
  }, [autoFocus, textareaDisabled]);

  const submitValue = useCallback(() => {
    const text = value.trim();
    if (
      (!text && files.length === 0) ||
      disabled ||
      isBusy ||
      isPreparing ||
      getChatMessageLength(text) > maxLength
    ) {
      return;
    }

    void onSubmit(text, files);
    setFiles([]);
    setAttachmentError(null);
  }, [disabled, files, isBusy, isPreparing, maxLength, onSubmit, value]);

  const handleSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      submitValue();
    },
    [submitValue],
  );

  const handleChange = useCallback(
    (event: ChangeEvent<HTMLTextAreaElement>) => {
      // Any manual edit un-dismisses the slash menu so it can reopen.
      setSkillMenuClosed(false);
      onChange(event.target.value);
    },
    [onChange],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (skillMenuOpen) {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setActiveSkillIndex((index) => (index + 1) % filteredSkills.length);
          return;
        }

        if (event.key === "ArrowUp") {
          event.preventDefault();
          setActiveSkillIndex(
            (index) => (index - 1 + filteredSkills.length) % filteredSkills.length,
          );
          return;
        }

        if (event.key === "Enter" || event.key === "Tab") {
          event.preventDefault();
          const skill = filteredSkills[activeSkillIndex] ?? filteredSkills[0];

          if (skill) {
            selectSkill(skill);
          }

          return;
        }

        if (event.key === "Escape") {
          event.preventDefault();
          setSkillMenuClosed(true);
          return;
        }
      }

      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        submitValue();
      }
    },
    [activeSkillIndex, filteredSkills, selectSkill, skillMenuOpen, submitValue],
  );

  const form = (
    <form
      className={cn(
        "relative min-w-0 rounded-[14px] border border-border/80 bg-card/95 shadow-sm transition-colors focus-within:border-border focus-within:ring-[1px] focus-within:ring-foreground/5 dark:bg-muted/45 dark:focus-within:ring-white/5",
        className,
      )}
      data-chat-composer
      onSubmit={handleSubmit}
    >
      <label className="sr-only" htmlFor={composerId}>
        Message harpy
      </label>
      {skillMenuOpen ? (
        <div className="absolute bottom-full left-0 z-20 mb-2 w-full overflow-hidden rounded-xl border border-border bg-popover text-popover-foreground shadow-lg">
          <div className="flex items-center gap-1.5 border-b border-border/60 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <SparklesIcon className="size-3" />
            Skills
          </div>
          <ul className="max-h-64 overflow-y-auto py-1" role="listbox">
            {filteredSkills.map((skill, index) => (
              <li aria-selected={index === activeSkillIndex} key={skill.slug} role="option">
                <button
                  className={cn(
                    "flex w-full items-start gap-3 px-3 py-2 text-left transition-colors",
                    index === activeSkillIndex ? "bg-muted" : "hover:bg-muted/60",
                  )}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    selectSkill(skill);
                  }}
                  onMouseEnter={() => setActiveSkillIndex(index)}
                  type="button"
                >
                  <span className="mt-0.5 shrink-0 rounded bg-background px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                    /{skill.slug}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {skill.name}
                    </span>
                    {skill.description ? (
                      <span className="block truncate text-xs text-muted-foreground">
                        {skill.description}
                      </span>
                    ) : null}
                  </span>
                  {skill.source === "custom" ? (
                    <span className="mt-0.5 shrink-0 rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-500">
                      custom
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {files.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 px-3 pt-3 sm:px-4">
          {files.map((file, index) => (
            <AttachmentChip
              className="max-w-52"
              key={`${file.name}-${index}`}
              mediaType={file.type}
              name={file.name}
              onRemove={() => removeFile(index)}
            />
          ))}
        </div>
      ) : null}
      {attachmentError ? (
        <p className="px-3 pt-2 text-xs text-destructive sm:px-4">{attachmentError}</p>
      ) : null}
      <textarea
        autoFocus={autoFocus}
        className="max-h-32 min-h-12 w-full resize-none bg-transparent px-3 pt-3 pb-1 text-base leading-6 outline-none placeholder:text-muted-foreground/45 disabled:cursor-not-allowed disabled:opacity-60 sm:px-4 md:text-[15px] dark:placeholder:text-muted-foreground/60"
        data-chat-composer-input
        disabled={textareaDisabled}
        id={composerId}
        maxLength={maxLength}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        placeholder={placeholder}
        ref={textareaRef}
        rows={2}
        value={value}
      />
      <div className="flex min-h-9 items-center justify-between gap-2 px-3 pt-1 pb-2 sm:gap-3 sm:px-4">
        <div className="-ml-2 flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
          <input
            accept="image/*,application/pdf,text/*,.json,.csv,.md,.ts,.tsx,.js,.py"
            aria-hidden="true"
            className="hidden"
            multiple
            onChange={handleFilesSelected}
            ref={fileInputRef}
            tabIndex={-1}
            type="file"
          />
          <button
            aria-label="Attach files"
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground/75 transition-colors hover:bg-muted/60 hover:text-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            disabled={disabled}
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            <PaperclipIcon className="size-4" />
          </button>
          {footerStart ?? <span className="block h-8" />}
        </div>
        <div className="flex shrink-0 items-center">
          {isBusy ? (
            <Button
              aria-label="Response in progress"
              className="size-6 cursor-default rounded-md bg-foreground/15 text-foreground/55 shadow-none hover:bg-foreground/15 disabled:cursor-default disabled:pointer-events-auto disabled:opacity-100"
              disabled
              size="icon-xs"
              type="button"
            >
              <SquareIcon className="size-2.5 fill-current" />
            </Button>
          ) : isPreparing ? (
            <Button
              aria-label="Preparing chat"
              className="size-6 rounded-md bg-foreground/75 text-background"
              disabled
              size="icon-xs"
              type="button"
            >
              <Loader2Icon className="size-3 animate-spin" />
            </Button>
          ) : (
            <Button
              aria-label="Send message"
              className="size-6 cursor-pointer rounded-md bg-foreground text-background hover:bg-foreground/90 disabled:cursor-not-allowed disabled:pointer-events-auto disabled:opacity-30"
              disabled={
                disabled || (trimmedValue.length === 0 && files.length === 0) || isOverMaxLength
              }
              size="icon-xs"
              type="submit"
            >
              <ArrowUpIcon className="size-3.5" />
            </Button>
          )}
        </div>
      </div>
    </form>
  );

  if (!disabledReason || (!disabled && !isBusy && !isPreparing)) {
    return form;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div aria-label={disabledReason} className="min-w-0" tabIndex={0}>
          {form}
        </div>
      </TooltipTrigger>
      <TooltipContent side="top">{disabledReason}</TooltipContent>
    </Tooltip>
  );
}
