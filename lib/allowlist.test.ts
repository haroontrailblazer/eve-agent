import { describe, expect, it } from "vitest";
import { getAllowedEmails, getOwnerEmail, isEmailAllowed } from "@/lib/allowlist";

const env = {
  HARPY_OWNER_EMAIL: "o@x.com",
  HARPY_ALLOWED_EMAILS: " A@x.com, ,b@x.com,o@x.com ",
};

describe("getOwnerEmail", () => {
  it("trims and lowercases HARPY_OWNER_EMAIL", () => {
    expect(getOwnerEmail({ HARPY_OWNER_EMAIL: "  Owner@Example.com " })).toBe("owner@example.com");
  });

  it("is null when HARPY_OWNER_EMAIL is unset", () => {
    expect(getOwnerEmail({})).toBeNull();
  });

  it("is null when HARPY_OWNER_EMAIL is blank", () => {
    expect(getOwnerEmail({ HARPY_OWNER_EMAIL: "   " })).toBeNull();
  });

  it("reads process.env by default", () => {
    process.env.HARPY_OWNER_EMAIL = " Env@Example.com";
    try {
      expect(getOwnerEmail()).toBe("env@example.com");
    } finally {
      delete process.env.HARPY_OWNER_EMAIL;
    }
  });
});

describe("getAllowedEmails", () => {
  it("lists the owner first, then HARPY_ALLOWED_EMAILS, deduped and lowercased", () => {
    expect(getAllowedEmails(env)).toEqual(["o@x.com", "a@x.com", "b@x.com"]);
  });

  it("is empty when nothing is configured", () => {
    expect(getAllowedEmails({})).toEqual([]);
  });
});

describe("isEmailAllowed", () => {
  it("allows a listed email in any case", () => {
    expect(isEmailAllowed("O@X.com", env)).toBe(true);
  });

  it("rejects an email that is not listed", () => {
    expect(isEmailAllowed("c@x.com", env)).toBe(false);
  });

  it("rejects a missing email", () => {
    expect(isEmailAllowed(null, env)).toBe(false);
    expect(isEmailAllowed(undefined, env)).toBe(false);
    expect(isEmailAllowed("  ", env)).toBe(false);
  });

  it("fails closed when the list is empty", () => {
    expect(isEmailAllowed("o@x.com", {})).toBe(false);
  });
});
