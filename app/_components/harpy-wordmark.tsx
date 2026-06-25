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
          "linear-gradient(160deg, #22d3ee 0%, #38bdf8 30%, #c084fc 70%, #e879f9 100%)",
        WebkitBackgroundClip: "text",
        backgroundClip: "text",
        color: "transparent",
        WebkitTextFillColor: "transparent",
        filter:
          "drop-shadow(0 0 6px rgba(34, 211, 238, 0.55)) drop-shadow(0 0 18px rgba(217, 70, 249, 0.4))",
      }}
    >
      harpy
    </span>
  );
}
