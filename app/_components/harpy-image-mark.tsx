import { HARPY_LOGO_PATH, HARPY_LOGO_VIEWBOX } from "@/lib/brand";

// Rendered via next/og (Satori) for the apple icon and OG image. The mark lives
// on a square canvas, so width and height are equal — no aspect handling needed.
export function HarpyImageMark({ size }: { readonly size: number }) {
  return (
    <svg
      fill="none"
      height={size}
      viewBox={HARPY_LOGO_VIEWBOX}
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d={HARPY_LOGO_PATH}
        fill="white"
        stroke="white"
        strokeLinejoin="round"
        strokeWidth={2}
      />
    </svg>
  );
}
