import { cn } from "@/lib/utils";

export function HarpyWordmark({ className }: { readonly className?: string }) {
  return (
    <span
      aria-label="harpy"
      className={cn("harpy-wordmark select-none font-black uppercase leading-none", className)}
      role="img"
    >
      harpy
    </span>
  );
}
