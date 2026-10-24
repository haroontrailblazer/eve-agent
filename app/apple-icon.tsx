import { ImageResponse } from "next/og";
import { BRAND_IMAGE_COLORS } from "@/lib/brand";
import { HarpyImageMark } from "./_components/harpy-image-mark";

export const size = {
  width: 180,
  height: 180,
};

export const contentType = "image/png";

const [tileTop, tileMiddle, tileBottom] = BRAND_IMAGE_COLORS.tile;

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background: `linear-gradient(180deg, ${tileTop} 0%, ${tileMiddle} 50%, ${tileBottom} 100%)`,
          borderRadius: 40,
          boxShadow: "inset 0 3px 4px rgba(255, 255, 255, 0.3)",
          display: "flex",
          height: "100%",
          justifyContent: "center",
          width: "100%",
        }}
      >
        <HarpyImageMark size={112} />
      </div>
    ),
    size,
  );
}
