import { RHP_LOGO_PATH, RHP_LOGO_VIEWBOX } from "@/lib/brand";
import { cn } from "@/lib/utils";

// The brand mark, split into the three isometric cube faces (top / right / left)
// that meet at the center. Each face renders the FULL path clipped to its face,
// so at rest the three tile back into the exact crisp logo (interlock weave
// intact) and the logo never disappears; each face just pops (bounces) in turn —
// see the harpy-logo styles in globals.css. Clean single-color line art
// (currentColor) so it stays sharp, never blurred.
const WEDGES = [
  { key: "top", points: "36,38.665 0,19.33 0,0 71.988,0 71.988,19.33" },
  { key: "right", points: "36,38.665 71.988,19.33 71.988,77.33 36,77.33" },
  { key: "left", points: "36,38.665 0,19.33 0,77.33 36,77.33" },
] as const;

export function HarpyLogo({ className }: { readonly className?: string }) {
  return (
    <span aria-hidden className={cn("harpy-logo inline-block text-foreground", className)}>
      <svg
        className="harpy-logo__svg block h-full w-full"
        viewBox={RHP_LOGO_VIEWBOX}
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {WEDGES.map((wedge) => (
            <clipPath
              clipPathUnits="userSpaceOnUse"
              id={`harpy-wedge-${wedge.key}`}
              key={wedge.key}
            >
              <polygon points={wedge.points} />
            </clipPath>
          ))}
        </defs>
        {WEDGES.map((wedge) => (
          <g
            className={`harpy-logo__part harpy-logo__part--${wedge.key}`}
            clipPath={`url(#harpy-wedge-${wedge.key})`}
            key={wedge.key}
          >
            <path
              clipRule="evenodd"
              d={RHP_LOGO_PATH}
              fill="currentColor"
              fillRule="evenodd"
            />
          </g>
        ))}
      </svg>
    </span>
  );
}
