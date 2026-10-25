import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ execute: vi.fn() }));

vi.mock("@/lib/db/client", () => ({ db: { execute: mocks.execute } }));

const {
  claimTemplateFallback,
  findWaMessage,
  getNotification,
  insertNotification,
  markNotificationFailed,
  markNotificationSent,
  recordWaMessage,
} = await import("@/lib/notify/store");

const NOW = "2026-10-25T10:00:00.000Z";
const PAYLOAD = { kind: "drafts_ready", ideaId: "i1", drafts: [{ id: "d1", revision: 1 }] } as const;

function rawRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "n1",
    brand_id: "b1",
    channel: "whatsapp",
    recipient: "15551234567",
    kind: "drafts_ready",
    dedupe_key: "drafts_ready:i1",
    payload: PAYLOAD,
    status: "pending",
    delivery: null,
    provider_message_id: null,
    attempts: 0,
    last_error: null,
    created_at: NOW,
    ...overrides,
  };
}

function render(query: unknown) {
  return new PgDialect().sqlToQuery(query as Parameters<PgDialect["sqlToQuery"]>[0]);
}

const input = {
  brandId: "b1",
  recipient: "15551234567",
  kind: "drafts_ready",
  dedupeKey: "drafts_ready:i1",
  payload: PAYLOAD,
} as const;

beforeEach(() => mocks.execute.mockReset());

describe("notification store", () => {
  it("inserts once, deduped on dedupe_key", async () => {
    mocks.execute.mockResolvedValueOnce({ rows: [rawRow()] });
    const result = await insertNotification(input);
    expect(result.created).toBe(true);
    expect(result.notification).toMatchObject({ id: "n1", brandId: "b1", status: "pending", createdAt: NOW });
    const { sql, params } = render(mocks.execute.mock.calls[0][0]);
    expect(sql).toContain('on conflict ("dedupe_key") do nothing');
    expect(params).toContain(JSON.stringify(PAYLOAD));
  });

  it("returns the existing row with created false when the insert is a no-op", async () => {
    mocks.execute
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [rawRow({ status: "sent", delivery: "service", attempts: 1 })] });
    const result = await insertNotification(input);
    expect(result.created).toBe(false);
    expect(result.notification).toMatchObject({ status: "sent", delivery: "service", attempts: 1 });
    expect(render(mocks.execute.mock.calls[1][0]).sql).toContain('"dedupe_key" = $');
  });

  it("marks sent and bumps attempts", async () => {
    mocks.execute.mockResolvedValueOnce({ rows: [] });
    await markNotificationSent({ id: "n1", delivery: "service", providerMessageId: "wamid.1" });
    const { sql, params } = render(mocks.execute.mock.calls[0][0]);
    expect(sql).toContain(`"status" = 'sent'`);
    expect(sql).toContain('"attempts" = "attempts" + 1');
    expect(params).toEqual(expect.arrayContaining(["service", "wamid.1", "n1"]));
  });

  it("marks failed with the error and bumps attempts", async () => {
    mocks.execute.mockResolvedValueOnce({ rows: [] });
    await markNotificationFailed({ id: "n1", error: "boom" });
    const { sql, params } = render(mocks.execute.mock.calls[0][0]);
    expect(sql).toContain(`"status" = 'failed'`);
    expect(sql).toContain('"attempts" = "attempts" + 1');
    expect(sql).toContain('"last_error" = $');
    expect(params).toEqual(expect.arrayContaining(["boom", "n1"]));
  });

  it("claims the template fallback only for a sent service message", async () => {
    mocks.execute.mockResolvedValueOnce({ rows: [rawRow({ status: "sent", delivery: "template", attempts: 2 })] });
    const claimed = await claimTemplateFallback("n1");
    expect(claimed).toMatchObject({ id: "n1", delivery: "template" });
    const { sql } = render(mocks.execute.mock.calls[0][0]);
    expect(sql).toContain(`"status" = 'sent'`);
    expect(sql).toContain(`"delivery" = 'service'`);
    expect(sql).toContain(`"delivery" = 'template'`);
    expect(sql).toContain('"attempts" = "attempts" + 1');
  });

  it("returns null when the fallback was already claimed", async () => {
    mocks.execute.mockResolvedValueOnce({ rows: [] });
    expect(await claimTemplateFallback("n1")).toBeNull();
  });

  it("reads a notification by id, or null", async () => {
    mocks.execute.mockResolvedValueOnce({ rows: [rawRow()] }).mockResolvedValueOnce({ rows: [] });
    expect(await getNotification("n1")).toMatchObject({ id: "n1", dedupeKey: "drafts_ready:i1" });
    expect(await getNotification("nope")).toBeNull();
  });

  it("normalizes a Date created_at to ISO", async () => {
    mocks.execute.mockResolvedValueOnce({ rows: [rawRow({ created_at: new Date(NOW) })] });
    expect((await getNotification("n1"))?.createdAt).toBe(NOW);
  });
});

describe("wa message map", () => {
  const map = {
    brandId: "b1",
    wamid: "wamid.1",
    draftId: "d1",
    revision: 2,
    kind: "card",
    notificationId: "n1",
    recipient: "15551234567",
  } as const;

  it("records a message once per wamid", async () => {
    mocks.execute.mockResolvedValueOnce({ rows: [] });
    await recordWaMessage(map);
    const { sql, params } = render(mocks.execute.mock.calls[0][0]);
    expect(sql).toContain('on conflict ("wamid") do nothing');
    expect(params).toEqual(expect.arrayContaining(["b1", "wamid.1", "d1", 2, "card", "n1", "15551234567"]));
  });

  it("finds a message by wamid", async () => {
    mocks.execute.mockResolvedValueOnce({
      rows: [{ brand_id: "b1", draft_id: "d1", revision: 2, kind: "full_text", notification_id: null }],
    });
    expect(await findWaMessage("wamid.1")).toEqual({
      brandId: "b1",
      draftId: "d1",
      revision: 2,
      kind: "full_text",
      notificationId: null,
    });
    expect(render(mocks.execute.mock.calls[0][0]).sql).toContain('"wamid" = $');
  });

  it("returns null for an unknown wamid", async () => {
    mocks.execute.mockResolvedValueOnce({ rows: [] });
    expect(await findWaMessage("wamid.x")).toBeNull();
  });
});
