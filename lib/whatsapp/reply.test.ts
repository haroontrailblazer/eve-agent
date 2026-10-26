import { describe, expect, it } from "vitest";
import { formatWhatsAppReply, planWhatsAppReply } from "@/lib/whatsapp/reply";

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

describe("planWhatsAppReply", () => {
  const allowAll = () => true;
  const toolLine = { finishReason: "tool-calls", message: "Drafting three posts now.", turnId: "t1" } as const;
  const final = { finishReason: "stop", message: "All set.", turnId: "t1" } as const;

  it("posts the first tool-calls line of a turn and records the turn", () => {
    expect(planWhatsAppReply(toolLine, null, allowAll)).toEqual({
      reply: { text: "Drafting three posts now.", imageUrls: [] },
      toolLineTurnId: "t1",
    });
  });

  it("posts no later tool-calls line in the same turn", () => {
    expect(planWhatsAppReply({ ...toolLine, message: "Now the image." }, "t1", allowAll)).toEqual({
      reply: null,
      toolLineTurnId: "t1",
    });
  });

  it("posts the first tool-calls line of the next turn", () => {
    expect(planWhatsAppReply({ ...toolLine, turnId: "t2" }, "t1", allowAll)).toEqual({
      reply: { text: "Drafting three posts now.", imageUrls: [] },
      toolLineTurnId: "t2",
    });
  });

  it("keeps the turn's line for later when a tool-calls message is empty", () => {
    expect(planWhatsAppReply({ ...toolLine, message: "  \n" }, null, allowAll)).toEqual({
      reply: null,
      toolLineTurnId: null,
    });
    expect(planWhatsAppReply({ ...toolLine, message: "" }, "t0", allowAll)).toEqual({
      reply: null,
      toolLineTurnId: "t0",
    });
  });

  it("always posts a final message and leaves the record alone", () => {
    expect(planWhatsAppReply(final, "t1", allowAll)).toEqual({
      reply: { text: "All set.", imageUrls: [] },
      toolLineTurnId: "t1",
    });
    expect(planWhatsAppReply(final, null, allowAll)).toEqual({
      reply: { text: "All set.", imageUrls: [] },
      toolLineTurnId: null,
    });
  });

  it("posts nothing for an empty final message", () => {
    expect(planWhatsAppReply({ ...final, message: "" }, null, allowAll)).toEqual({ reply: null, toolLineTurnId: null });
  });

  it("treats a stored value that is not a turn id as none", () => {
    expect(planWhatsAppReply(toolLine, 42, allowAll).toolLineTurnId).toBe("t1");
  });

  it("formats the line like any reply", () => {
    const url = "https://ok.example/a.png";
    const message = `On it, see [docs](https://a.b)\n\n![x](${url})`;
    expect(planWhatsAppReply({ ...toolLine, message }, null, allowAll)).toEqual({
      reply: { text: "On it, see docs: https://a.b", imageUrls: [url] },
      toolLineTurnId: "t1",
    });
  });
});
