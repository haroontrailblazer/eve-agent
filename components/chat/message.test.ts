import type { EveAuthorizationPart, EveMessage } from "eve/react";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AuthorizationCard } from "./authorization-card";
import { AgentMessage } from "./message";

// Markdown pulls in the syntax highlighter, which is slow to load and unused here.
vi.mock("@/components/chat/markdown", () => ({ Markdown: () => null }));

const required: EveAuthorizationPart = {
  attemptId: "a1",
  authorization: {
    instructions: "Sign in to Notion in the new tab.",
    url: "https://auth.example/notion",
    userCode: "ABCD-1234",
  },
  description: "Notion needs access.",
  displayName: "Notion",
  name: "notion",
  state: "required",
  stepIndex: 0,
  turnId: "t1",
  type: "authorization",
};

function completed(outcome: "authorized" | "declined" | "failed" | "timed-out") {
  return {
    attemptId: "a1",
    description: "Notion needs access.",
    displayName: "Notion",
    name: "notion",
    outcome,
    state: "completed",
    stepIndex: 0,
    turnId: "t1",
    type: "authorization",
  } satisfies EveAuthorizationPart;
}

function render(message: EveMessage, overrides: { isInputOpen?: (id: string) => boolean } = {}) {
  return renderToStaticMarkup(
    createElement(AgentMessage, {
      canRespond: true,
      isCancelling: false,
      isInputOpen: overrides.isInputOpen ?? (() => true),
      isStreaming: false,
      message,
      onCancelTurn: vi.fn(),
      onInputResponses: vi.fn(),
    }),
  );
}

function assistant(...parts: EveMessage["parts"]): EveMessage {
  return { id: "m1", parts, role: "assistant" };
}

describe("AuthorizationCard", () => {
  it("shows the title, instructions, connect link and code", () => {
    const html = renderToStaticMarkup(
      createElement(AuthorizationCard, { isSkipping: false, onSkip: vi.fn(), part: required }),
    );

    expect(html).toContain("Connect Notion");
    expect(html).toContain("Sign in to Notion in the new tab.");
    expect(html).toContain('href="https://auth.example/notion"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noreferrer"');
    expect(html).toContain("Code: ");
    expect(html).toContain("ABCD-1234");
    expect(html).toContain("Skip");
  });

  it("falls back to the description and omits the link and code", () => {
    const html = renderToStaticMarkup(
      createElement(AuthorizationCard, {
        isSkipping: false,
        onSkip: vi.fn(),
        part: { ...required, authorization: undefined },
      }),
    );

    expect(html).toContain("Notion needs access.");
    expect(html).not.toContain("<a ");
    expect(html).not.toContain("Code: ");
  });

  it("reads Skipping... and disables the button while skipping", () => {
    const html = renderToStaticMarkup(
      createElement(AuthorizationCard, { isSkipping: true, onSkip: vi.fn(), part: required }),
    );

    expect(html).toContain("Skipping...");
    expect(html).toMatch(/<button[^>]*disabled/);
  });
});

describe("AgentMessage authorization parts", () => {
  it("renders the card for a required part", () => {
    const html = render(assistant(required));

    expect(html).toContain("Connect Notion");
    expect(html).toContain("Skip");
  });

  it("renders one muted line for a completed part", () => {
    expect(render(assistant(completed("authorized")))).toContain("Notion connected.");
    expect(render(assistant(completed("declined")))).toContain("Notion skipped.");
    expect(render(assistant(completed("failed")))).toContain("Notion sign-in didn&#x27;t finish.");
    expect(render(assistant(completed("timed-out")))).toContain(
      "Notion sign-in didn&#x27;t finish.",
    );
  });
});

describe("AgentMessage file parts", () => {
  it("renders an attachment chip named by filename, else media type", () => {
    const html = render({
      id: "m2",
      parts: [
        { filename: "brief.pdf", mediaType: "application/pdf", type: "file", url: "https://a.example/b.pdf" },
        { mediaType: "image/png", type: "file" },
        { text: "see attached", type: "text" },
      ],
      role: "user",
    });

    expect(html).toContain("brief.pdf");
    expect(html).toContain("image/png");
    expect(html).toContain("see attached");
  });
});

describe("AgentMessage input requests", () => {
  const message = assistant({
    input: {},
    state: "approval-requested",
    approval: { id: "r1" },
    toolCallId: "c1",
    toolMetadata: {
      eve: {
        inputRequest: {
          kind: "tool-approval",
          options: [{ id: "yes", label: "Approve" }],
          prompt: "Allow this?",
          requestId: "r1",
        },
        kind: "tool-call",
        label: "Create post",
        name: "create_post",
      },
    },
    toolName: "create_post",
    type: "dynamic-tool",
  });

  it("enables the buttons while the input is open", () => {
    const html = render(message, { isInputOpen: (id) => id === "r1" });

    expect(html).toContain("Approve");
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*>Approve/);
  });

  it("disables the buttons once the input is no longer open", () => {
    const html = render(message, { isInputOpen: () => false });

    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Approve/);
  });
});

describe("AgentMessage tool labels", () => {
  it("prefers the eve label", () => {
    const html = render(
      assistant({
        input: { query: "ignored" },
        output: {},
        state: "output-available",
        toolCallId: "c1",
        toolMetadata: { eve: { kind: "tool-call", label: "Found 3 Notion pages", name: "eve__search" } },
        toolName: "eve__search",
        type: "dynamic-tool",
      }),
    );

    expect(html).toContain("Found 3 Notion pages");
  });

  it("describes catalog tools without a label by their query", () => {
    const html = render(
      assistant({
        input: { query: "linear__" },
        output: {},
        state: "output-available",
        toolCallId: "c1",
        toolName: "eve__search",
        type: "dynamic-tool",
      }),
    );

    expect(html).toContain("Searched linear__");
  });
});
