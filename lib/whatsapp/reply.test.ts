import { describe, expect, it } from "vitest";
import { formatWhatsAppReply } from "@/lib/whatsapp/reply";

describe("formatWhatsAppReply", () => {
  it("lifts allowed images out of the text", () => {
    const url = "https://x.public.blob.vercel-storage.com/media/1.png";
    expect(formatWhatsAppReply(`Here\n\n![a cat](${url})\n\nDone`)).toEqual({ text: "Here\n\nDone", imageUrls: [url] });
  });

  it("drops disallowed images from the text and the urls", () => {
    expect(formatWhatsAppReply("Here\n\n![x](https://evil.example/x.png)\n\nDone")).toEqual({
      text: "Here\n\nDone",
      imageUrls: [],
    });
  });

  it("uses an injected allow check", () => {
    const result = formatWhatsAppReply("![x](https://ok.example/a.png)", (url) => url.startsWith("https://ok."));
    expect(result.imageUrls).toEqual(["https://ok.example/a.png"]);
  });

  it("rewrites links", () => {
    expect(formatWhatsAppReply("[docs](https://a.b)").text).toBe("docs: https://a.b");
    expect(formatWhatsAppReply("[https://a.b](https://a.b)").text).toBe("https://a.b");
  });

  it("collapses blank runs and trims", () => {
    expect(formatWhatsAppReply("\n\na\n\n\n\nb\n\n").text).toBe("a\n\nb");
  });
});
