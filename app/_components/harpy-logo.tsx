import { HARPY_LOGO_PATH, HARPY_LOGO_VIEWBOX } from "@/lib/brand";
import { cn } from "@/lib/utils";

// The harpy feather, split into three vertical bands — left vane, shaft, right
// vane — each rendering the FULL mark clipped to its band, so at rest they tile
// back into the exact feather and each vane can flutter (pop) on its own from
// the shaft. See the harpy-logo styles in globals.css.
const VANES = [
  { key: "left", points: "0,0 48,0 48,100 0,100" },
  { key: "center", points: "48,0 52,0 52,100 48,100" },
  { key: "right", points: "52,0 100,0 100,100 52,100" },
] as const;

export function HarpyLogo({ className }: { readonly className?: string }) {
  return (
    <span aria-hidden className={cn("harpy-logo inline-block text-foreground", className)}>
      <svg
        className="harpy-logo__svg block h-full w-full"
        viewBox={HARPY_LOGO_VIEWBOX}
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {VANES.map((vane) => (
            <clipPath
              clipPathUnits="userSpaceOnUse"
              id={`harpy-vane-${vane.key}`}
              key={vane.key}
            >
              <polygon points={vane.points} />
            </clipPath>
          ))}
        </defs>
        {VANES.map((vane) => (
          <g
            className={`harpy-logo__part harpy-logo__part--${vane.key}`}
            clipPath={`url(#harpy-vane-${vane.key})`}
            key={vane.key}
          >
            <path
              d={HARPY_LOGO_PATH}
              fill="currentColor"
              stroke="currentColor"
              strokeLinejoin="round"
              strokeWidth={2}
            />
          </g>
        ))}
      </svg>
    </span>
  );
}
