import { describe, expect, it } from "vitest";
import { createEvalOwnerAuth, type EvalOwnerDeps } from "@/lib/eval-auth";

const request = new Request("http://localhost/eve/v1/session");
const deps = (over: Partial<EvalOwnerDeps> = {}): EvalOwnerDeps => ({
  localDev: async () => ({ authenticator: "local-dev", issuer: "local", principalId: "dev", principalType: "user", subject: "dev", attributes: {} }),
  findOwner: async () => ({ id: "u1", email: "owner@example.com" }),
  brandFor: async () => "b1",
  env: () => ({ NODE_ENV: "development", HARPY_EVAL_AS_OWNER: "1" }),
  ...over,
});

describe("createEvalOwnerAuth", () => {
  it("maps a local dev caller to the owner with the eval channel", async () =>
    expect(await createEvalOwnerAuth(deps())(request)).toMatchObject({
      principalId: "u1",
      subject: "owner@example.com",
      authenticator: "harpy-eval",
      issuer: "harpy-eval",
      principalType: "user",
      attributes: { brandId: "b1", channel: "eval", email: "owner@example.com", name: "eval" },
    }));
  it("is off in production even with the flag", async () =>
    expect(await createEvalOwnerAuth(deps({ env: () => ({ NODE_ENV: "production", HARPY_EVAL_AS_OWNER: "1" }) }))(request)).toBeNull());
  it("is off without the flag", async () =>
    expect(await createEvalOwnerAuth(deps({ env: () => ({ NODE_ENV: "development" }) }))(request)).toBeNull());
  it("is off when localDev rejects the caller", async () =>
    expect(await createEvalOwnerAuth(deps({ localDev: async () => null }))(request)).toBeNull());
  it("refuses when the owner never signed in", async () =>
    await expect(createEvalOwnerAuth(deps({ findOwner: async () => null }))(request)).rejects.toThrow("Sign in to harpy once"));
  it("never grants tool stubs", async () =>
    expect(await createEvalOwnerAuth(deps())(request)).not.toHaveProperty("allowToolStubs"));
  it("checks env before localDev or the database", async () => {
    const touched: string[] = [];
    const result = await createEvalOwnerAuth(
      deps({
        env: () => ({ NODE_ENV: "production", HARPY_EVAL_AS_OWNER: "1" }),
        localDev: async () => (touched.push("localDev"), null),
        findOwner: async () => (touched.push("findOwner"), null),
      }),
    )(request);
    expect(result).toBeNull();
    expect(touched).toEqual([]);
  });
});
