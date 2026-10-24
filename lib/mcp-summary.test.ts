import { describe, expect, it } from "vitest";
import type { McpConnectionRow } from "@/lib/db/mcp";
import { toMcpConnectionSummary } from "@/lib/mcp-summary";

const row: McpConnectionRow = {
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
  secretsUnreadable: false,
};

describe("toMcpConnectionSummary", () => {
  it("keeps only platform, account, enabled, hasToken and needsReconnect", () => {
    expect(toMcpConnectionSummary(row)).toEqual({
      platform: "notion",
      account: "me@example.com",
      enabled: true,
      hasToken: true,
      needsReconnect: false,
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

  it("asks for a reconnect when the row's secrets could not be decrypted", () => {
    const summary = toMcpConnectionSummary({
      ...row,
      oauth: null,
      secretsUnreadable: true,
      token: null,
    });

    expect(summary.needsReconnect).toBe(true);
    expect(summary.hasToken).toBe(false);
  });
});
