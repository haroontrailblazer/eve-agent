import { describe, expect, it } from "vitest";
import type { SkillSummary } from "@/lib/skills/catalog";
import {
  CONNECTION_LABELS,
  buildAttachmentClientContext,
  buildSkillClientContext,
  buildTurnClientContext,
  createConnectionClientContext,
} from "./client-context";

const summarize: SkillSummary = {
  description: "",
  name: "Summarize",
  prompt: " Summarize it. ",
  slug: "summarize",
  source: "builtin",
};

describe("CONNECTION_LABELS", () => {
  it("labels each connection", () => {
    expect(CONNECTION_LABELS).toEqual({
      linear: "Linear",
      notion: "Notion",
      sentry: "Sentry",
    });
  });
});

describe("createConnectionClientContext", () => {
  it("names enabled and disabled connections", () => {
    expect(
      createConnectionClientContext({ linear: true, notion: true, sentry: false }),
    ).toBe(
      "The user has enabled these external connections for this turn: Linear, Notion. Use an enabled connection when it is relevant to the user's request. Do not use disabled connections unless the user enables them first: Sentry.",
    );
  });

  it("omits the disabled sentence when everything is enabled", () => {
    expect(
      createConnectionClientContext({ linear: true, notion: true, sentry: true }),
    ).toBe(
      "The user has enabled these external connections for this turn: Linear, Notion, Sentry. Use an enabled connection when it is relevant to the user's request.",
    );
  });

  it("says all connections are disabled when none are enabled", () => {
    expect(
      createConnectionClientContext({ linear: false, notion: false, sentry: false }),
    ).toBe(
      "The user has disabled all external connections for this turn. Do not search or call connection tools unless the user enables a connection first.",
    );
  });
});

describe("buildSkillClientContext", () => {
  it("turns a leading slash command into an instruction", () => {
    expect(buildSkillClientContext("/Summarize this", [summarize])).toBe(
      'The user invoked the "/summarize" skill. Treat the text after the "/summarize" command as the input and apply this instruction to it: Summarize it.',
    );
  });

  it("returns null for an unknown slug", () => {
    expect(buildSkillClientContext("/unknown this", [summarize])).toBeNull();
  });

  it("returns null for text without a leading slash", () => {
    expect(buildSkillClientContext("Summarize this", [summarize])).toBeNull();
    expect(buildSkillClientContext("hey /summarize", [summarize])).toBeNull();
  });

  it("returns null when the slash has no command", () => {
    expect(buildSkillClientContext("/ nothing", [summarize])).toBeNull();
  });

  it("returns null for an empty prompt", () => {
    expect(
      buildSkillClientContext("/summarize this", [{ ...summarize, prompt: "   " }]),
    ).toBeNull();
  });

  it("returns null when skills have not loaded", () => {
    expect(buildSkillClientContext("/summarize this", null)).toBeNull();
  });
});

describe("buildAttachmentClientContext", () => {
  it("returns null without images", () => {
    expect(buildAttachmentClientContext([])).toBeNull();
  });

  it("describes a single hosted image", () => {
    expect(buildAttachmentClientContext(["https://a.example/x.png"])).toBe(
      "The user attached 1 image, hosted at: https://a.example/x.png. To edit, enhance, upscale, restyle, or otherwise transform an attached image, call generate_image with sourceImageUrl set to that hosted URL. Do not ask the user for a link.",
    );
  });

  it("pluralizes and joins several hosted images", () => {
    expect(
      buildAttachmentClientContext(["https://a.example/x.png", "https://a.example/y.png"]),
    ).toBe(
      "The user attached 2 images, hosted at: https://a.example/x.png, https://a.example/y.png. To edit, enhance, upscale, restyle, or otherwise transform an attached image, call generate_image with sourceImageUrl set to that hosted URL. Do not ask the user for a link.",
    );
  });
});

describe("buildTurnClientContext", () => {
  const enabled = { linear: false, notion: false, sentry: false };

  it("returns only the connection context when nothing else applies", () => {
    expect(
      buildTurnClientContext({ enabled, hostedImageUrls: [], message: "hi", skills: null }),
    ).toEqual([createConnectionClientContext(enabled)]);
  });

  it("returns connection, skill and attachment context in order", () => {
    expect(
      buildTurnClientContext({
        enabled,
        hostedImageUrls: ["https://a.example/x.png"],
        message: "/summarize this",
        skills: [summarize],
      }),
    ).toEqual([
      createConnectionClientContext(enabled),
      buildSkillClientContext("/summarize this", [summarize]),
      buildAttachmentClientContext(["https://a.example/x.png"]),
    ]);
  });

  it("drops the null entries", () => {
    const result = buildTurnClientContext({
      enabled,
      hostedImageUrls: ["https://a.example/x.png"],
      message: "plain",
      skills: [summarize],
    });

    expect(result).toHaveLength(2);
    expect(result[1]).toContain("The user attached 1 image");
  });
});
