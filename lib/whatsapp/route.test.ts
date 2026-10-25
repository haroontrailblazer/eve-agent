import { createHmac } from "node:crypto";
import type { RouteDefinition, RouteHandlerArgs } from "eve/channels";
import { describe, expect, it, vi } from "vitest";
import { type RouteArgsLike, type RouteLike, webhookResetter, wrapWhatsAppRoutes } from "@/lib/whatsapp/route";
import type { WhatsAppStatus } from "@/lib/whatsapp/statuses";

// eve's real route and args types must fit the structural ones, so
// wrapWhatsAppRoutes(bridge.channel.routes, ...) typechecks.
type Assignable<From, To> = [From] extends [To] ? true : false;
const routeFits: Assignable<RouteDefinition, RouteLike> = true;
const argsFit: Assignable<RouteHandlerArgs, RouteArgsLike> = true;
void routeFits;
void argsFit;

const SECRET = "app-secret";
const payload = {
  entry: [
    {
      changes: [
        {
          field: "messages",
          value: { statuses: [{ id: "wamid.a", status: "failed", recipient_id: "1", errors: [{ code: 131047 }] }] },
        },
      ],
    },
  ],
};

function sign(body: string): string {
  return `sha256=${createHmac("sha256", SECRET).update(body).digest("hex")}`;
}

function setup() {
  const reset = vi.fn(async (_options?: { reason?: string }) => ({ status: "reset" }));
  const waitUntil = vi.fn();
  const args = { from: vi.fn(() => ({ reset })), waitUntil } as unknown as RouteArgsLike;
  const seen: { body: string | null; resetter: unknown } = { body: null, resetter: undefined };
  const handler = vi.fn(async (request: Request) => {
    seen.body = request.method === "POST" ? await request.text() : null;
    seen.resetter = webhookResetter.getStore();
    return new Response("ok");
  });
  const onStatuses = vi.fn(async (_statuses: WhatsAppStatus[]) => {});
  const [route] = wrapWhatsAppRoutes([{ method: "POST", path: "/whatsapp", handler } as RouteLike], {
    appSecret: () => SECRET,
    onStatuses,
  });
  return { route: route as RouteLike, args, handler, seen, reset, waitUntil, onStatuses };
}

function post(body: string, signature: string | null): Request {
  return new Request("https://harpy.test/whatsapp", {
    method: "POST",
    body,
    headers: signature ? { "x-hub-signature-256": signature } : {},
  });
}

describe("wrapWhatsAppRoutes", () => {
  it("hands a signed statuses payload to onStatuses through waitUntil and leaves the body readable", async () => {
    const { route, args, seen, waitUntil, onStatuses } = setup();
    const body = JSON.stringify(payload);

    const response = (await route.handler(post(body, sign(body)), args)) as Response;

    expect(response.status).toBe(200);
    expect(seen.body).toBe(body);
    expect(waitUntil).toHaveBeenCalledTimes(1);
    expect(onStatuses).toHaveBeenCalledWith([{ wamid: "wamid.a", status: "failed", recipient: "1", errorCode: 131047 }]);
  });

  it("ignores unsigned and wrongly signed bodies but still runs the handler", async () => {
    const { route, args, handler, onStatuses, waitUntil } = setup();
    const body = JSON.stringify(payload);

    await route.handler(post(body, null), args);
    await route.handler(post(body, "sha256=abc"), args);

    expect(handler).toHaveBeenCalledTimes(2);
    expect(onStatuses).not.toHaveBeenCalled();
    expect(waitUntil).not.toHaveBeenCalled();
  });

  it("swallows unparseable signed bodies and skips payloads without statuses", async () => {
    const { route, args, handler, onStatuses } = setup();

    await route.handler(post("not json", sign("not json")), args);
    const empty = JSON.stringify({ entry: [] });
    await route.handler(post(empty, sign(empty)), args);

    expect(handler).toHaveBeenCalledTimes(2);
    expect(onStatuses).not.toHaveBeenCalled();
  });

  it("does nothing special when no app secret is configured", async () => {
    const handler = vi.fn(async () => new Response("ok"));
    const onStatuses = vi.fn(async () => {});
    const [route] = wrapWhatsAppRoutes([{ method: "POST", handler } as RouteLike], { appSecret: () => null, onStatuses });
    const body = JSON.stringify(payload);
    await (route as RouteLike).handler(post(body, sign(body)), { from: vi.fn(), waitUntil: vi.fn() } as unknown as RouteArgsLike);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(onStatuses).not.toHaveBeenCalled();
  });

  it("passes a GET straight through", async () => {
    const { route, args, handler, onStatuses } = setup();
    const request = new Request("https://harpy.test/whatsapp?hub.mode=subscribe", { method: "GET" });

    const response = (await route.handler(request, args)) as Response;

    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledWith(request, args);
    expect(onStatuses).not.toHaveBeenCalled();
  });

  it("exposes the session reset to the handler", async () => {
    const { route, args, seen, reset } = setup();
    const body = JSON.stringify({ entry: [] });

    await route.handler(post(body, sign(body)), args);

    const resetter = seen.resetter as (address: string) => Promise<boolean>;
    expect(await resetter("whatsapp:15551234567")).toBe(true);
    expect(reset).toHaveBeenCalledWith({ reason: "/new" });
    reset.mockResolvedValueOnce({ status: "no_active_session" });
    expect(await resetter("whatsapp:15551234567")).toBe(false);
  });

  it("returns websocket routes unchanged", () => {
    const ws = { transport: "websocket", handler: vi.fn() } as unknown as RouteLike;
    const [wrapped] = wrapWhatsAppRoutes([ws], { appSecret: () => SECRET });
    expect(wrapped).toBe(ws);
  });
});
