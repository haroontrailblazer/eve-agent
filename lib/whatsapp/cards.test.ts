import { describe, expect, it } from "vitest";

import {
  CARD_BODY_MAX,
  CARD_FOOTER_MAX,
  type CardDraft,
  type HarpyAction,
  harpyActionId,
  parseHarpyActionId,
  reviewCardMessages,
} from "@/lib/whatsapp/cards";

function draft(overrides: Partial<CardDraft> = {}): CardDraft {
  return {
    id: "d1",
    revision: 2,
    platform: "linkedin",
    posts: ["x".repeat(20)],
    text: "x".repeat(20),
    scheduledAt: null,
    ...overrides,
  };
}

function bodyOf(message: Readonly<Record<string, unknown>>): string {
  return (message.interactive as { body: { text: string } }).body.text;
}

describe("harpy action ids", () => {
  it("round-trips every verb", () => {
    const actions: HarpyAction[] = [
      { verb: "approve", draftId: "d1", revision: 3 },
      { verb: "skip", draftId: "d1", revision: 3 },
      { verb: "edit", draftId: "d1", revision: 3 },
      { verb: "review", ideaId: "i1" },
    ];
    for (const action of actions) expect(parseHarpyActionId(harpyActionId(action))).toEqual(action);
    expect(harpyActionId(actions[0]!)).toBe("harpy:approve:d1:3");
    expect(harpyActionId(actions[3]!)).toBe("harpy:review:i1");
  });

  it("rejects malformed ids", () => {
    for (const raw of [
      "harpy:approve:d1",
      "harpy:approve:d1:0",
      "harpy:approve:d1:abc",
      "harpy:publish:d1:1",
      "harpy:approve::1",
      "harpy:review:",
      "chat:{}",
      `harpy:approve:${"d".repeat(300)}:1`,
    ]) {
      expect(parseHarpyActionId(raw), raw).toBeNull();
    }
  });
});

describe("reviewCardMessages", () => {
  it("builds one card with an image header and three buttons", () => {
    const messages = reviewCardMessages({
      waId: "1555",
      draft: draft(),
      imageUrl: "https://blob/x.png",
      timezone: "UTC",
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]!.kind).toBe("card");
    expect(messages[0]!.message).toEqual({
      to: "1555",
      type: "interactive",
      interactive: {
        type: "button",
        header: { type: "image", image: { link: "https://blob/x.png" } },
        body: { text: "x".repeat(20) },
        footer: { text: "LinkedIn · 20 chars" },
        action: {
          buttons: [
            { type: "reply", reply: { id: "harpy:approve:d1:2", title: "Approve" } },
            { type: "reply", reply: { id: "harpy:edit:d1:2", title: "Edit" } },
            { type: "reply", reply: { id: "harpy:skip:d1:2", title: "Skip" } },
          ],
        },
      },
    });
  });

  it("numbers thread posts in the body", () => {
    const [card] = reviewCardMessages({
      waId: "1555",
      draft: draft({ platform: "x", posts: ["first", "second"], text: "first" }),
      imageUrl: null,
      timezone: "UTC",
    });

    expect(bodyOf(card!.message)).toBe("1/2 first\n\n2/2 second");
  });

  it("sends the full text first when the body is too long", () => {
    const long = Array.from({ length: 300 }, () => "word").join(" ");
    const messages = reviewCardMessages({
      waId: "1555",
      draft: draft({ posts: [long], text: long }),
      imageUrl: null,
      timezone: "UTC",
    });

    expect(long.length).toBeGreaterThan(CARD_BODY_MAX);
    expect(messages.map((m) => m.kind)).toEqual(["full_text", "card"]);
    expect(messages[0]!.message).toEqual({ to: "1555", type: "text", text: { preview_url: false, body: long } });
    const body = bodyOf(messages[1]!.message);
    expect(body.length).toBeLessThanOrEqual(CARD_BODY_MAX);
    expect(body.endsWith("…\n\n(Full text above.)")).toBe(true);
    expect(body.startsWith("word word")).toBe(true);
  });

  it("cuts an unbroken long body to 900 characters", () => {
    const long = "y".repeat(1500);
    const messages = reviewCardMessages({
      waId: "1555",
      draft: draft({ posts: [long], text: long }),
      imageUrl: null,
      timezone: "UTC",
    });
    const body = bodyOf(messages[1]!.message);

    expect(body.length).toBeLessThanOrEqual(CARD_BODY_MAX);
    expect(body.endsWith("(Full text above.)")).toBe(true);
  });

  it("keeps the footer within the limit for an x post with a link", () => {
    const [card] = reviewCardMessages({
      waId: "1555",
      draft: draft({ platform: "x", posts: ["see https://example.com"], text: "see https://example.com" }),
      imageUrl: null,
      timezone: "UTC",
    });
    const footer = (card!.message.interactive as { footer: { text: string } }).footer.text;

    expect(footer).toContain("includes a link");
    expect(footer.length).toBeLessThanOrEqual(CARD_FOOTER_MAX);
  });

  it("omits the header without an image", () => {
    const [card] = reviewCardMessages({ waId: "1555", draft: draft(), imageUrl: null, timezone: "UTC" });

    expect(card!.message.interactive).not.toHaveProperty("header");
  });
});
