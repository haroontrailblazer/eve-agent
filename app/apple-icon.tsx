import { ImageResponse } from "next/og";
import { HarpyImageMark } from "./_components/harpy-image-mark";

export const size = {
  width: 180,
  height: 180,
};

export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background: "linear-gradient(180deg, #54585f 0%, #26282c 50%, #0a0b0d 100%)",
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
