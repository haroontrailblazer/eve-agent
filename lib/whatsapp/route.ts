import { AsyncLocalStorage } from "node:async_hooks";
import { extractStatuses, handleStatuses, verifyMetaSignature, type WhatsAppStatus } from "@/lib/whatsapp/statuses";

// Wraps the Chat SDK bridge's routes so harpy sees what the adapter drops
// (delivery statuses) and the channel can reach eve's session reset (/new).

export type SessionResetter = (address: string) => Promise<boolean>;

// Set while the original handler runs, so channel code can reset a session.
export const webhookResetter = new AsyncLocalStorage<SessionResetter>();

export type RouteLike = {
  readonly transport?: string;
  // Method syntax keeps the parameter bivariant, so eve's routes (whose
  // handlers take the full RouteHandlerArgs) fit this narrower shape. The
  // result is unknown because eve's websocket handlers return hooks, not a
  // Response; HTTP handlers return a Response and so does the wrapper.
  handler(request: Request, args: RouteArgsLike): unknown;
};

export type RouteArgsLike = {
  readonly from: (address: string) => { reset(options?: { reason?: string }): Promise<{ status: string }> };
  readonly waitUntil: (promise: Promise<unknown>) => void;
};

async function readSignedStatuses(request: Request, secret: string | null): Promise<WhatsAppStatus[]> {
  if (!secret) return [];
  try {
    const raw = await request.clone().text();
    if (!verifyMetaSignature(raw, request.headers.get("x-hub-signature-256"), secret)) return [];
    return extractStatuses(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function wrapWhatsAppRoutes<T extends RouteLike>(
  routes: readonly T[],
  options: {
    readonly appSecret: () => string | null;
    readonly onStatuses?: (statuses: WhatsAppStatus[]) => Promise<void>;
  },
): T[] {
  const onStatuses = options.onStatuses ?? handleStatuses;
  return routes.map((route) => {
    if (route.transport === "websocket") return route;
    return {
      ...route,
      handler: async (request: Request, args: RouteArgsLike) => {
        if (request.method === "POST") {
          const statuses = await readSignedStatuses(request, options.appSecret());
          if (statuses.length > 0) args.waitUntil(onStatuses(statuses));
        }
        const resetter: SessionResetter = async (address) =>
          (await args.from(address).reset({ reason: "/new" })).status === "reset";
        return webhookResetter.run(resetter, () => route.handler(request, args));
      },
    };
  });
}
