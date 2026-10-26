import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveChannelAuth = vi.fn();
vi.mock("@/lib/channel-auth", () => ({
  resolveChannelAuth: (...args: unknown[]) => resolveChannelAuth(...args),
}));
const redeemLinkCode = vi.fn();
vi.mock("@/lib/link-codes", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/link-codes")>()),
  redeemLinkCode: (...args: unknown[]) => redeemLinkCode(...args),
}));

import { decideSlackInbound, resolveSlackAuth, SLACK_COPY, slackExternalId } from "@/lib/slack-auth";

const slackAuth = (attributes: Record<string, string | readonly string[]>, issuer = "slack:T1") => ({
  attributes,
  authenticator: "eve-slack",
  issuer,
  principalId: "slack:T1:U1",
  principalType: "user",
});

const defaultAuth = slackAuth({ team_id: "T1", user_id: "U1", scopes: ["a", "b"] });
const linkedAuth = {
  attributes: { brandId: "b1", channel: "slack", email: "owner@example.com" },
  authenticator: "harpy-slack",
  issuer: "slack",
  principalId: "user-1",
  principalType: "user",
};

beforeEach(() => {
  resolveChannelAuth.mockReset();
  redeemLinkCode.mockReset();
});

describe("slackExternalId", () => {
  it("joins team and user ids", () => {
    expect(slackExternalId(defaultAuth)).toBe("T1:U1");
  });

  it("falls back to the issuer for the team", () => {
    expect(slackExternalId(slackAuth({ user_id: "U1" }, "slack:T9"))).toBe("T9:U1");
  });

  it("is null without a user id or auth", () => {
    expect(slackExternalId(slackAuth({ team_id: "T1" }))).toBeNull();
    expect(slackExternalId(null)).toBeNull();
  });
});

describe("resolveSlackAuth", () => {
  it("passes the external id and only string attributes", async () => {
    resolveChannelAuth.mockResolvedValue(linkedAuth);

    await expect(resolveSlackAuth(defaultAuth)).resolves.toBe(linkedAuth);
    expect(resolveChannelAuth).toHaveBeenCalledWith({
      channel: "slack",
      externalId: "T1:U1",
      extraAttributes: { team_id: "T1", user_id: "U1" },
    });
  });

  it("is null without an external id", async () => {
    await expect(resolveSlackAuth(null)).resolves.toBeNull();
    expect(resolveChannelAuth).not.toHaveBeenCalled();
  });
});

describe("decideSlackInbound", () => {
  const base = { defaultAuth, isDirect: true, isMention: false, text: "hello" };

  it("starts a turn for a linked user", async () => {
    resolveChannelAuth.mockResolvedValue(linkedAuth);

    await expect(decideSlackInbound(base)).resolves.toEqual({ auth: linkedAuth, kind: "turn" });
  });

  it("hints to an unlinked DM or mention", async () => {
    resolveChannelAuth.mockResolvedValue(null);

    await expect(decideSlackInbound(base)).resolves.toEqual({ kind: "reply", text: SLACK_COPY.unlinked });
    await expect(decideSlackInbound({ ...base, isDirect: false, isMention: true })).resolves.toEqual({
      kind: "reply",
      text: SLACK_COPY.unlinked,
    });
  });

  it("drops an unlinked plain channel message", async () => {
    resolveChannelAuth.mockResolvedValue(null);

    await expect(decideSlackInbound({ ...base, isDirect: false })).resolves.toEqual({ kind: "drop" });
  });

  it("drops a linked user's channel message outside a thread harpy is in", async () => {
    resolveChannelAuth.mockResolvedValue(linkedAuth);

    await expect(decideSlackInbound({ ...base, isDirect: false, isSubscribed: false })).resolves.toEqual({
      kind: "drop",
    });
    await expect(decideSlackInbound({ ...base, isDirect: false })).resolves.toEqual({ kind: "drop" });
    expect(resolveChannelAuth).not.toHaveBeenCalled();
  });

  it("starts a turn for a linked user's message in a thread harpy is in", async () => {
    resolveChannelAuth.mockResolvedValue(linkedAuth);

    await expect(decideSlackInbound({ ...base, isDirect: false, isSubscribed: true })).resolves.toEqual({
      auth: linkedAuth,
      kind: "turn",
    });
  });

  it("drops an unlinked user's message in a thread harpy is in", async () => {
    resolveChannelAuth.mockResolvedValue(null);

    await expect(decideSlackInbound({ ...base, isDirect: false, isSubscribed: true })).resolves.toEqual({
      kind: "drop",
    });
  });

  it("answers DMs and mentions whether or not the thread is subscribed", async () => {
    resolveChannelAuth.mockResolvedValue(linkedAuth);

    await expect(decideSlackInbound({ ...base, isSubscribed: false })).resolves.toEqual({
      auth: linkedAuth,
      kind: "turn",
    });
    await expect(
      decideSlackInbound({ ...base, isDirect: false, isMention: true, isSubscribed: false }),
    ).resolves.toEqual({ auth: linkedAuth, kind: "turn" });
  });

  it("links on a LINK code in a DM", async () => {
    redeemLinkCode.mockResolvedValue({ email: "owner@example.com", ok: true });

    await expect(decideSlackInbound({ ...base, text: "LINK 123456" })).resolves.toEqual({
      kind: "reply",
      text: SLACK_COPY.linked("owner@example.com"),
    });
    expect(redeemLinkCode).toHaveBeenCalledWith({ channel: "slack", code: "123456", externalId: "T1:U1" });
  });

  it("replies with the failure copy for a bad code", async () => {
    redeemLinkCode.mockResolvedValue({ ok: false, reason: "invalid" });

    await expect(decideSlackInbound({ ...base, text: "link 000000" })).resolves.toEqual({
      kind: "reply",
      text: SLACK_COPY.linkFailed,
    });
  });

  it("does not treat a LINK code in a channel mention as a command", async () => {
    resolveChannelAuth.mockResolvedValue(null);

    const decision = await decideSlackInbound({ ...base, isDirect: false, isMention: true, text: "LINK 123456" });

    expect(redeemLinkCode).not.toHaveBeenCalled();
    expect(decision).toEqual({ kind: "reply", text: SLACK_COPY.unlinked });
  });
});
