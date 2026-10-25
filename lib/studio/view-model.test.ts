import { describe, expect, it } from "vitest";
import { snapshot, studioDraft, studioIdea } from "@/lib/studio/test-fixtures";
import {
  canReview,
  draftMeta,
  draftWarnings,
  formatLocalTime,
  ideaPhase,
  ideaSourceLabel,
  isRevising,
  missingTargets,
  needsPolling,
  selectableDraftIds,
} from "@/lib/studio/view-model";

const now = new Date("2026-10-24T10:00:00Z");

describe("ideaPhase", () => {
  it("is drafting for 10 minutes, then stalled", () => {
    const idea = studioIdea({
      requested: { platforms: ["x", "linkedin"], pieces: [] },
      drafts: [studioDraft({ platform: "x" })],
    });
    expect(ideaPhase({ ...idea, draftRequestedAt: "2026-10-24T09:55:00Z" }, now)).toBe("drafting");
    expect(ideaPhase({ ...idea, draftRequestedAt: "2026-10-24T09:49:00Z" }, now)).toBe("stalled");
    expect(ideaPhase(idea, now)).toBe("stalled");
    expect(missingTargets(idea)).toEqual([{ kind: "post", platform: "linkedin" }]);
  });

  it("is ready when every requested target exists", () =>
    expect(
      ideaPhase(
        studioIdea({ requested: { platforms: ["x"], pieces: [] }, drafts: [studioDraft({ platform: "x" })] }),
        now,
      ),
    ).toBe("ready"));

  it("counts pieces as targets", () => {
    const idea = studioIdea({ requested: { platforms: [], pieces: ["reel_script", "carousel_outline"] } });
    expect(missingTargets(idea)).toEqual([
      { kind: "piece", piece: "reel_script" },
      { kind: "piece", piece: "carousel_outline" },
    ]);
  });
});

describe("isRevising", () => {
  it("is true for 10 minutes after a revision request", () => {
    expect(isRevising(studioDraft({ revisionRequestedAt: "2026-10-24T09:55:00Z" }), now)).toBe(true);
    expect(isRevising(studioDraft({ revisionRequestedAt: "2026-10-24T09:49:00Z" }), now)).toBe(false);
    expect(isRevising(studioDraft(), now)).toBe(false);
  });
});

describe("canReview", () => {
  const revising = studioDraft({ revisionRequestedAt: "2026-10-24T09:55:00Z" });

  it("hides Approve while harpy revises the draft", () => {
    expect(canReview(revising, "approve", now)).toBe(false);
    expect(canReview(studioDraft(), "approve", now)).toBe(true);
  });

  it("offers Approve again once the revision request goes stale", () =>
    expect(canReview(studioDraft({ revisionRequestedAt: "2026-10-24T09:49:00Z" }), "approve", now)).toBe(true));

  it("keeps the other actions while revising, as the draft's state allows", () => {
    expect(canReview(revising, "skip", now)).toBe(true);
    expect(canReview(revising, "edit", now)).toBe(true);
    expect(canReview(revising, "restore", now)).toBe(false);
  });

  it("follows the draft's state", () => {
    expect(canReview(studioDraft({ status: "approved" }), "approve", now)).toBe(false);
    expect(canReview(studioDraft({ status: "skipped" }), "restore", now)).toBe(true);
  });
});

describe("formatting", () => {
  it("formats in the brand zone", () =>
    expect(formatLocalTime("2026-10-27T04:00:00Z", "Asia/Kolkata")).toBe("Tue 9:30 AM"));

  it("builds the meta line with the X link cost", () =>
    expect(
      draftMeta(
        studioDraft({
          platform: "x",
          posts: ["read https://a.co"],
          text: "read https://a.co",
          scheduledAt: "2026-10-27T04:00:00Z",
        }),
        "Asia/Kolkata",
      ),
    ).toBe("X · 28 chars · Tue 9:30 AM · includes a link · $0.20"));

  it("counts thread posts", () =>
    expect(draftMeta(studioDraft({ platform: "x", posts: ["a", "b", "c"] }), "UTC")).toBe("X · 3 posts"));

  it("does not charge for links off X", () =>
    expect(draftMeta(studioDraft({ platform: "linkedin", posts: ["see https://a.co"] }), "UTC")).toBe(
      "LinkedIn · 16 chars",
    ));
});

describe("draftWarnings", () => {
  it("returns lint messages, allowing links on every platform except X", () => {
    expect(draftWarnings(studioDraft({ platform: "linkedin", posts: ["see https://a.co"] }))).toEqual([]);
    expect(draftWarnings(studioDraft({ platform: "x", posts: ["see https://a.co"] }))).toEqual([
      expect.stringContaining("$0.20"),
    ]);
    expect(draftWarnings(studioDraft({ platform: "x", posts: ["a — b"] })).length).toBeGreaterThan(0);
  });
});

describe("needsPolling", () => {
  it("polls while drafting or revising, not otherwise", () => {
    expect(
      needsPolling(
        snapshot({
          ideas: [studioIdea({ draftRequestedAt: "2026-10-24T09:59:00Z", requested: { platforms: ["x"], pieces: [] } })],
        }),
        now,
      ),
    ).toBe(true);
    expect(
      needsPolling(
        snapshot({ ideas: [studioIdea({ drafts: [studioDraft({ revisionRequestedAt: "2026-10-24T09:59:00Z" })] })] }),
        now,
      ),
    ).toBe(true);
    expect(needsPolling(snapshot({ ideas: [] }), now)).toBe(false);
  });
});

describe("ideaSourceLabel", () => {
  const label = (sourceChannel: "studio" | "web" | "whatsapp" | "slack" | "schedule", createdAt: string) =>
    ideaSourceLabel(studioIdea({ sourceChannel, createdAt }), now);

  it("labels each channel and age", () => {
    expect(label("studio", "2026-10-24T09:59:40Z")).toBe("via Studio · just now");
    expect(label("web", "2026-10-24T09:30:00Z")).toBe("via chat · 30 min ago");
    expect(label("whatsapp", "2026-10-24T07:00:00Z")).toBe("via WhatsApp · 3 h ago");
    expect(label("slack", "2026-10-22T07:00:00Z")).toBe("via Slack · Oct 22");
    expect(label("schedule", "2026-10-24T09:59:00Z")).toBe("via brief · 1 min ago");
  });
});

describe("selectableDraftIds", () => {
  it("lists drafts of every idea in display order", () => {
    const s = snapshot({
      ideas: [
        studioIdea({ id: "i1", drafts: [studioDraft({ id: "a" }), studioDraft({ id: "b" })] }),
        studioIdea({ id: "i2", drafts: [studioDraft({ id: "c" })] }),
      ],
    });
    expect(selectableDraftIds(s)).toEqual(["a", "b", "c"]);
  });
});
