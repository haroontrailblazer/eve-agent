import { describe, expect, it } from "vitest";

import {
  WHATSAPP_GRAPH_VERSION,
  getAllowedWhatsAppNumbers,
  getWhatsAppConfig,
  isWhatsAppConfigured,
  normalizeWaNumber,
  waMeLink,
} from "./config";

const full = {
  WHATSAPP_ACCESS_TOKEN: "token",
  WHATSAPP_APP_SECRET: "secret",
  WHATSAPP_PHONE_NUMBER_ID: "123",
  WHATSAPP_VERIFY_TOKEN: "verify",
};

describe("getWhatsAppConfig", () => {
  it("is null when nothing is set", () => {
    expect(getWhatsAppConfig({})).toBeNull();
    expect(isWhatsAppConfigured({})).toBe(false);
  });

  it.each(Object.keys(full))("is null when %s is blank", (key) => {
    expect(getWhatsAppConfig({ ...full, [key]: "  " })).toBeNull();
  });

  it("returns the config with a normalized display number", () => {
    const config = getWhatsAppConfig({ ...full, HARPY_WHATSAPP_NUMBER: "+1 (555) 123-4567" });

    expect(config).toEqual({
      accessToken: "token",
      appSecret: "secret",
      phoneNumberId: "123",
      verifyToken: "verify",
      displayNumber: "15551234567",
    });
    expect(isWhatsAppConfigured(full)).toBe(true);
  });

  it("has a null display number when none is set", () => {
    expect(getWhatsAppConfig(full)?.displayNumber).toBeNull();
  });
});

describe("normalizeWaNumber", () => {
  it("keeps digits only", () => {
    expect(normalizeWaNumber("+44 7700 900123")).toBe("447700900123");
  });

  it("rejects numbers outside 8 to 15 digits", () => {
    expect(normalizeWaNumber("123")).toBeNull();
    expect(normalizeWaNumber("abc")).toBeNull();
    expect(normalizeWaNumber("1234567890123456")).toBeNull();
  });
});

describe("getAllowedWhatsAppNumbers", () => {
  it("normalizes, dedupes and drops invalid entries", () => {
    expect(
      getAllowedWhatsAppNumbers({
        HARPY_WHATSAPP_ALLOWED_NUMBERS: "+1 555 123 4567, 447700900123,bad,15551234567",
      }),
    ).toEqual(["15551234567", "447700900123"]);
  });

  it("is empty when unset", () => {
    expect(getAllowedWhatsAppNumbers({})).toEqual([]);
  });
});

describe("waMeLink", () => {
  it("builds an encoded wa.me link", () => {
    expect(waMeLink("15551234567", "LINK 123456")).toBe("https://wa.me/15551234567?text=LINK%20123456");
  });
});

it("pins the graph version", () => {
  expect(WHATSAPP_GRAPH_VERSION).toBe("v25.0");
});
