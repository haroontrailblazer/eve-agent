import { RHP_LOGO_PATH, RHP_LOGO_VIEWBOX } from "@/lib/brand";
import { cn } from "@/lib/utils";

// The animated 3D brand mark shown in the hero lockup. The 3D read comes from a
// metallic gradient front face, two darker offset copies behind it (a faux
// extrusion), a grounding drop-shadow, and a gentle perspective rotation. All
// animation is CSS (see globals.css) and is disabled under prefers-reduced-motion.
export function HarpyLogo({ className }: { readonly className?: string }) {
  return (
    <span aria-hidden className={cn("harpy-logo inline-block", className)}>
      <span className="harpy-logo__persp block h-full w-full">
        <span className="harpy-logo__inner block h-full w-full">
          <svg
            className="harpy-logo__svg h-full w-full"
            viewBox={RHP_LOGO_VIEWBOX}
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <linearGradient id="harpyLogoMetal" x1="0" x2="0.35" y1="0" y2="1">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="16%" stopColor="#e6e6e6" />
                <stop offset="44%" stopColor="#b4b4b4" />
                <stop offset="52%" stopColor="#6f6f6f" />
                <stop offset="64%" stopColor="#c9c9c9" />
                <stop offset="100%" stopColor="#f4f4f4" />
              </linearGradient>
            </defs>
            {/* extrusion depth */}
            <path
              clipRule="evenodd"
              d={RHP_LOGO_PATH}
              fill="#242424"
              fillRule="evenodd"
              transform="translate(2.4 2.9)"
            />
            <path
              clipRule="evenodd"
              d={RHP_LOGO_PATH}
              fill="#4a4a4a"
              fillRule="evenodd"
              transform="translate(1.2 1.4)"
            />
            {/* front face */}
            <path
              clipRule="evenodd"
              d={RHP_LOGO_PATH}
              fill="url(#harpyLogoMetal)"
              fillRule="evenodd"
            />
          </svg>
        </span>
      </span>
    </span>
  );
}
