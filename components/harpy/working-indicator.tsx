import { HarpyLogo } from "@/app/_components/harpy-logo";

// The lively logo flaps next to a shimmering label. Both animations stop under
// prefers-reduced-motion (see app/globals.css).
export function WorkingIndicator({ label }: { readonly label: string }) {
  return (
    <div className="inline-flex items-center gap-2" role="status">
      <HarpyLogo className="harpy-logo--lively size-4" />
      <span className="shimmer-text text-small">{label}</span>
    </div>
  );
}
