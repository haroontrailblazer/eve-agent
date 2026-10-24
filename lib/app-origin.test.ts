import { describe, expect, it } from "vitest";
import { appUrl, getAppOrigin, getConfiguredAppHosts, toOrigin } from "@/lib/app-origin";

describe("toOrigin", () => {
  it.each([
    ["", undefined],
    ["  ", undefined],
    [undefined, undefined],
    ["harpy.example.com", "https://harpy.example.com"],
    ["https://harpy.example.com/path/?q=1#h", "https://harpy.example.com"],
    ["http://localhost:3000/", "http://localhost:3000"],
    ["ftp://x.example", undefined],
    ["https://HARPY.example.com:443", "https://harpy.example.com"],
  ])("toOrigin(%j) is %j", (input, expected) => {
    expect(toOrigin(input)).toBe(expected);
  });
});

describe("getAppOrigin", () => {
  it("falls back to localhost when nothing is configured", () => {
    expect(getAppOrigin({})).toBe("http://localhost:3000");
  });

  it("skips empty strings instead of stopping at them", () => {
    expect(
      getAppOrigin({ BETTER_AUTH_URL: "", VERCEL_PROJECT_PRODUCTION_URL: "harpy.vercel.app" }),
    ).toBe("https://harpy.vercel.app");
  });

  it("prefers BETTER_AUTH_URL over the Vercel urls", () => {
    expect(getAppOrigin({ BETTER_AUTH_URL: "https://a.example", VERCEL_URL: "b.vercel.app" })).toBe(
      "https://a.example",
    );
  });

  it("prefers VERCEL_PROJECT_PRODUCTION_URL over VERCEL_URL", () => {
    expect(
      getAppOrigin({ VERCEL_PROJECT_PRODUCTION_URL: "prod.vercel.app", VERCEL_URL: "b.vercel.app" }),
    ).toBe("https://prod.vercel.app");
  });

  it("ignores NEXT_PUBLIC_SITE_URL", () => {
    expect(getAppOrigin({ NEXT_PUBLIC_SITE_URL: "https://site.example" })).toBe(
      "http://localhost:3000",
    );
  });

  it("reads process.env by default", () => {
    process.env.BETTER_AUTH_URL = "https://env.example/";
    try {
      expect(getAppOrigin()).toBe("https://env.example");
    } finally {
      delete process.env.BETTER_AUTH_URL;
    }
  });
});

describe("appUrl", () => {
  it("joins a path onto the origin without doubling slashes", () => {
    expect(appUrl("api/images/x", { BETTER_AUTH_URL: "https://a.example/" })).toBe(
      "https://a.example/api/images/x",
    );
  });

  it("accepts a path with a leading slash", () => {
    expect(appUrl("/api/images/x", { BETTER_AUTH_URL: "https://a.example" })).toBe(
      "https://a.example/api/images/x",
    );
  });
});

describe("getConfiguredAppHosts", () => {
  it("returns the hosts of every configured url", () => {
    expect(
      getConfiguredAppHosts({ BETTER_AUTH_URL: "https://a.example", VERCEL_URL: "b.vercel.app" }),
    ).toEqual(["a.example", "b.vercel.app"]);
  });

  it("returns nothing when nothing is configured", () => {
    expect(getConfiguredAppHosts({})).toEqual([]);
  });

  it("keeps ports and drops duplicates", () => {
    expect(
      getConfiguredAppHosts({
        BETTER_AUTH_URL: "http://localhost:3001",
        VERCEL_PROJECT_PRODUCTION_URL: "harpy.vercel.app",
        VERCEL_URL: "https://harpy.vercel.app",
      }),
    ).toEqual(["localhost:3001", "harpy.vercel.app"]);
  });
});
