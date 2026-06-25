import { cn } from "@/lib/utils";

export function HarpyWordmark({ className }: { readonly className?: string }) {
  return (
    <span
      aria-label="harpy"
      className={cn(
        "select-none font-black uppercase leading-none",
        className,
      )}
      role="img"
      style={{
        fontFamily: "var(--font-orbitron)",
        letterSpacing: "0.08em",
        backgroundImage:
          "linear-gradient(180deg, #f5f5f5 0%, #ffffff 14%, #c4c4c4 38%, #6f6f6f 50%, #bdbdbd 63%, #ffffff 86%, #cfcfcf 100%)",
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        color: "transparent",
        WebkitTextFillColor: "transparent",
        filter:
          "drop-shadow(0 2px 2px rgba(0, 0, 0, 0.45)) drop-shadow(0 0 1px rgba(255, 255, 255, 0.25))",
      }}
    >
      harpy
    </span>
  );
}
