import { describe, expect, it } from "vitest";
import { getAuthErrorMessage } from "@/lib/auth-errors";

describe("getAuthErrorMessage", () => {
  it("explains not_allowed without setup links", () => {
    expect(getAuthErrorMessage("not_allowed", null)).toEqual({
      title: "This account can't use harpy",
      body: "harpy is private to its owner. Sign in with an allowed Vercel account, or ask the owner to add your email to HARPY_ALLOWED_EMAILS.",
      showSetupLinks: false,
    });
  });

  it("falls back to the default copy with setup links for an unknown code", () => {
    expect(getAuthErrorMessage("unknown_code", null)).toEqual({
      title: "Sign-in could not finish",
      body: "Check the Vercel App callback URL, required scopes, Better Auth secret, and database migrations. The setup guide has the exact values to verify.",
      showSetupLinks: true,
    });
  });

  it("uses the default copy when there is no error at all", () => {
    expect(getAuthErrorMessage(null, null)).toEqual(getAuthErrorMessage("unknown_code", null));
  });

  it("keeps setup links for setup errors", () => {
    expect(getAuthErrorMessage("email_not_found", null)).toMatchObject({
      title: "Vercel email scope is missing",
      showSetupLinks: true,
    });
  });

  it("reads the description when the code is unknown", () => {
    expect(getAuthErrorMessage(null, "Invalid callback URL")).toMatchObject({
      title: "Callback URL is not allowed",
      showSetupLinks: true,
    });
  });
});
