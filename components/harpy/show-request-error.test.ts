import { beforeEach, describe, expect, it, vi } from "vitest";
import { toast } from "sonner";
import { showRequestError } from "@/components/harpy/show-request-error";

vi.mock("sonner", () => ({ toast: { error: vi.fn() } }));

describe("showRequestError", () => {
  beforeEach(() => {
    vi.mocked(toast.error).mockClear();
  });

  it("shows an error toast titled Request failed with the message as its description", () => {
    showRequestError("Failed to send message.");

    expect(toast.error).toHaveBeenCalledWith("Request failed", {
      description: "Failed to send message.",
      id: "Failed to send message.",
    });
  });

  it("uses the message as the toast id, so a repeated error updates one toast", () => {
    showRequestError("Chat not found.");
    showRequestError("Chat not found.");

    const ids = vi.mocked(toast.error).mock.calls.map(([, options]) => options?.id);

    expect(ids).toEqual(["Chat not found.", "Chat not found."]);
  });
});
