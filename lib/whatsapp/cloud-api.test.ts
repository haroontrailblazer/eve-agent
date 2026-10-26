import { describe, expect, it, vi } from "vitest";

import { recipientFields, sendWhatsApp, textMessage, WINDOW_CLOSED_CODE } from "@/lib/whatsapp/cloud-api";
import type { WhatsAppConfig } from "@/lib/whatsapp/config";

const config: WhatsAppConfig = {
  accessToken: "TOKEN",
  appSecret: "secret",
  phoneNumberId: "PNID",
  verifyToken: "verify",
  displayNumber: null,
};

function reply(status: number, body: unknown): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

describe("recipientFields", () => {
  it("uses to for phone numbers and recipient for BSUIDs", () => {
    expect(recipientFields("15551234567")).toEqual({ to: "15551234567" });
    expect(recipientFields("US.13491208655302741918")).toEqual({ recipient: "US.13491208655302741918" });
    expect(recipientFields("US.ENT.abc123")).toEqual({ recipient: "US.ENT.abc123" });
  });
});

describe("textMessage", () => {
  it("builds a plain text body without link previews", () => {
    expect(textMessage("1555", "hi")).toEqual({ to: "1555", type: "text", text: { preview_url: false, body: "hi" } });
  });
});

describe("sendWhatsApp", () => {
  it("posts to the graph api and returns the wamid", async () => {
    const fetchMock = reply(200, { messages: [{ id: "wamid.1" }] });
    const result = await sendWhatsApp(textMessage("1555", "hi"), { config, fetch: fetchMock });

    expect(result).toEqual({ ok: true, wamid: "wamid.1" });
    const [url, init] = vi.mocked(fetchMock).mock.calls[0]!;
    expect(url).toBe("https://graph.facebook.com/v25.0/PNID/messages");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toMatchObject({ Authorization: "Bearer TOKEN", "Content-Type": "application/json" });
    expect(JSON.parse(String(init?.body))).toEqual({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: "1555",
      type: "text",
      text: { preview_url: false, body: "hi" },
    });
  });

  it("flags a closed customer service window", async () => {
    const result = await sendWhatsApp(textMessage("1555", "hi"), {
      config,
      fetch: reply(400, { error: { code: WINDOW_CLOSED_CODE, message: "Re-engagement message" } }),
    });

    expect(result).toEqual({ ok: false, code: 131047, windowClosed: true, message: "Re-engagement message" });
  });

  it("reports other errors without flagging the window", async () => {
    const result = await sendWhatsApp(textMessage("1555", "hi"), {
      config,
      fetch: reply(500, { error: { code: 1, message: "boom" } }),
    });

    expect(result).toMatchObject({ ok: false, code: 1, windowClosed: false, message: "boom" });
  });

  it("returns code null when fetch throws", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const result = await sendWhatsApp(textMessage("1555", "hi"), { config, fetch: fetchMock });

    expect(result).toMatchObject({ ok: false, code: null, windowClosed: false });
  });

  it("makes no request when whatsapp is not set up", async () => {
    const fetchMock = reply(200, {});
    const result = await sendWhatsApp(textMessage("1555", "hi"), { config: null, fetch: fetchMock });

    expect(result).toEqual({ ok: false, code: null, windowClosed: false, message: "WhatsApp is not set up." });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
