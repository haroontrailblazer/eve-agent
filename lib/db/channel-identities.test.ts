import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ execute: vi.fn() }));

vi.mock("@/lib/db/client", () => ({ db: { execute: mocks.execute } }));

const { findLinkedIdentity, findWhatsAppRecipient, linkIdentity, listIdentitiesForBrand, unlinkIdentity } =
  await import("@/lib/db/channel-identities");

const NOW = "2026-10-25T10:00:00.000Z";

function joinedRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "ci1",
    user_id: "u1",
    brand_id: "b1",
    channel: "whatsapp",
    external_id: "15551234567",
    phone: "+15551234567",
    bsuid: null,
    linked_at: NOW,
    email: "a@example.com",
    name: "Ada",
    ...overrides,
  };
}

function render(query: unknown) {
  return new PgDialect().sqlToQuery(query as Parameters<PgDialect["sqlToQuery"]>[0]);
}

beforeEach(() => mocks.execute.mockReset());

describe("channel identities", () => {
  it("links an identity, taking over an existing (channel, external_id)", async () => {
    mocks.execute.mockResolvedValueOnce({ rows: [] });
    await linkIdentity({ channel: "whatsapp", externalId: "15551234567", userId: "u1", brandId: "b1" });
    const { sql, params } = render(mocks.execute.mock.calls[0][0]);
    expect(sql).toContain('on conflict ("channel", "external_id") do update');
    expect(sql).toContain('"linked_at" = now()');
    expect(params).toEqual(expect.arrayContaining(["whatsapp", "15551234567", "u1", "b1"]));
  });

  it("finds a linked identity with the user's email and name", async () => {
    mocks.execute.mockResolvedValueOnce({ rows: [joinedRow({ linked_at: new Date(NOW) })] });
    expect(await findLinkedIdentity("whatsapp", "15551234567")).toEqual({
      id: "ci1",
      userId: "u1",
      brandId: "b1",
      channel: "whatsapp",
      externalId: "15551234567",
      phone: "+15551234567",
      bsuid: null,
      email: "a@example.com",
      name: "Ada",
      linkedAt: NOW,
    });
    const { sql } = render(mocks.execute.mock.calls[0][0]);
    expect(sql).toContain('join "user"');
    expect(sql).toContain('"channel" = $');
  });

  it("returns null for a stranger", async () => {
    mocks.execute.mockResolvedValueOnce({ rows: [] });
    expect(await findLinkedIdentity("whatsapp", "999")).toBeNull();
  });

  it("lists a brand's identities newest first", async () => {
    mocks.execute.mockResolvedValueOnce({ rows: [joinedRow(), joinedRow({ id: "ci2" })] });
    const list = await listIdentitiesForBrand("b1");
    expect(list.map((i) => i.id)).toEqual(["ci1", "ci2"]);
    const { sql } = render(mocks.execute.mock.calls[0][0]);
    expect(sql).toContain('"brand_id" = $');
    expect(sql).toContain('order by ci."linked_at" desc');
  });

  it("unlinks within the brand and reports whether a row went", async () => {
    mocks.execute.mockResolvedValueOnce({ rows: [{ id: "ci1" }] }).mockResolvedValueOnce({ rows: [] });
    expect(await unlinkIdentity("b1", "ci1")).toBe(true);
    expect(render(mocks.execute.mock.calls[0][0]).sql).toContain('"brand_id" = $');
    expect(await unlinkIdentity("b1", "nope")).toBe(false);
  });

  it("finds the newest whatsapp recipient for a user in a brand", async () => {
    mocks.execute.mockResolvedValueOnce({ rows: [{ external_id: "15551234567" }] }).mockResolvedValueOnce({ rows: [] });
    expect(await findWhatsAppRecipient("b1", "u1")).toBe("15551234567");
    const { sql, params } = render(mocks.execute.mock.calls[0][0]);
    expect(sql).toContain(`"channel" = 'whatsapp'`);
    expect(sql).toContain('"brand_id" = $');
    expect(sql).toContain('"user_id" = $');
    expect(params).toEqual(expect.arrayContaining(["b1", "u1"]));
    expect(await findWhatsAppRecipient("b1", "u2")).toBeNull();
  });
});
