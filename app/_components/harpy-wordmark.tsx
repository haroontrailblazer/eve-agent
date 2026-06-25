import { cn } from "@/lib/utils";

export function HarpyWordmark({ className }: { readonly className?: string }) {
  return (
    <span
      aria-label="harpy"
      className={cn(
        "select-none font-semibold lowercase leading-none tracking-tight text-foreground",
        className,
      )}
      role="img"
    >
      harpy
    </span>
  );
}
