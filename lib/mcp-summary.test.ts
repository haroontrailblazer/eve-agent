import { describe, expect, it } from "vitest";
import type { McpConnection } from "@/lib/db/schema";
import { toMcpConnectionSummary } from "@/lib/mcp-summary";

const row: McpConnection = {
  id: "c1",
  userId: "u1",
  platform: "notion",
  url: "https://mcp.notion.com/mcp",
  token: "secret-token",
  account: "me@example.com",
  enabled: true,
  oauth: { box: "sealed" },
  oauthState: "state-123",
  createdAt: new Date(0),
  updatedAt: new Date(0),
};

describe("toMcpConnectionSummary", () => {
  it("keeps only platform, account, enabled and hasToken", () => {
    expect(toMcpConnectionSummary(row)).toEqual({
      platform: "notion",
      account: "me@example.com",
      enabled: true,
      hasToken: true,
    });
  });

  it("never carries a token, oauth data, url or ids", () => {
    const serialized = JSON.stringify(toMcpConnectionSummary(row));

    expect(serialized).not.toContain("secret-token");
    expect(serialized).not.toContain("sealed");
    expect(serialized).not.toContain("state-123");
    expect(serialized).not.toContain("mcp.notion.com");
    expect(serialized).not.toContain("u1");
  });

  it("reports hasToken false for a missing or empty token", () => {
    expect(toMcpConnectionSummary({ ...row, token: null }).hasToken).toBe(false);
    expect(toMcpConnectionSummary({ ...row, token: "" }).hasToken).toBe(false);
  });

  it("passes a null account and a disabled row through", () => {
    expect(toMcpConnectionSummary({ ...row, account: null, enabled: false })).toMatchObject({
      account: null,
      enabled: false,
    });
  });
});
