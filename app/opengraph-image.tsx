import { ImageResponse } from "next/og";
import { BRAND_IMAGE_COLORS } from "@/lib/brand";
import { HarpyImageMark } from "./_components/harpy-image-mark";

export const alt = "harpy";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background: BRAND_IMAGE_COLORS.ogBackground,
          color: "white",
          display: "flex",
          flexDirection: "column",
          gap: 32,
          height: "100%",
          justifyContent: "center",
          width: "100%",
        }}
      >
        <HarpyImageMark size={150} />
        <div
          style={{
            display: "flex",
            fontSize: 140,
            fontWeight: 600,
            letterSpacing: -6,
            lineHeight: 1,
          }}
        >
          harpy
        </div>
        <div
          style={{
            color: BRAND_IMAGE_COLORS.ogMuted,
            display: "flex",
            fontSize: 38,
          }}
        >
          Your own AI agent
        </div>
      </div>
    ),
    size,
  );
}
