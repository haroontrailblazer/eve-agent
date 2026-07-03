import { RHP_LOGO_PATH, RHP_LOGO_VIEWBOX } from "@/lib/brand";

// Rendered via next/og (Satori) for the apple icon and OG image. Kept simple —
// a single evenodd fill path, with height derived from the logo's aspect ratio
// (72 x 77.33) so it never distorts and never depends on preserveAspectRatio.
export function HarpyImageMark({ size }: { readonly size: number }) {
  const height = Math.round((size * 77.33) / 71.988);

  return (
    <svg
      fill="none"
      height={height}
      viewBox={RHP_LOGO_VIEWBOX}
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        clipRule="evenodd"
        d={RHP_LOGO_PATH}
        fill="white"
        fillRule="evenodd"
        stroke="white"
        strokeLinejoin="round"
        strokeWidth={1.3}
      />
    </svg>
  );
}
