import { beforeEach, describe, expect, it, vi } from "vitest";
import { getInitialSetupStatus } from "@/lib/setup";

const READY_ENV = {
  BETTER_AUTH_SECRET: "secret",
  DATABASE_URL: "postgres://user:pass@db.example/harpy",
  HARPY_OWNER_EMAIL: "owner@example.com",
  NEXT_PUBLIC_VERCEL_APP_CLIENT_ID: "client-id",
  UPSTASH_REDIS_REST_TOKEN: "token",
  UPSTASH_REDIS_REST_URL: "https://redis.example",
  VERCEL_APP_CLIENT_SECRET: "client-secret",
};

describe("getInitialSetupStatus mediaReady", () => {
  beforeEach(() => {
    for (const [name, value] of Object.entries(READY_ENV)) {
      vi.stubEnv(name, value);
    }
  });

  it("is true when a Blob token is set", () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "vercel_blob_rw_token");

    expect(getInitialSetupStatus()).toMatchObject({ appReady: true, mediaReady: true });
  });

  it("is false without a Blob token, and the app is still ready", () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");

    expect(getInitialSetupStatus()).toMatchObject({ appReady: true, mediaReady: false });
  });

  it("does not list the Blob token as missing setup", () => {
    vi.stubEnv("BLOB_READ_WRITE_TOKEN", "");

    expect(getInitialSetupStatus().missing).toEqual([]);
  });
});
