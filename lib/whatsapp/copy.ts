// Every WhatsApp reply harpy writes itself. Replies from the model live in the
// agent; replies for taps, link codes and limits come from here.

export const COPY = {
  linked: (email: string) => `Linked. harpy knows this number as ${email}.`,
  linkFailed: "That code didn't work. Make a new one on the Channels page.",
  rateLimited: "You're sending messages faster than I can keep up. Give me a few minutes.",
  reset: "Started a new conversation. Your drafts, calendar and voice are kept.",
  voiceFailed: "I couldn't make out that voice note. Could you type it?",
  approved: (label: string) => `Approved the ${label} draft. It waits in Studio under Up next.`,
  skipped: (label: string) => `Skipped the ${label} draft. You can restore it in Studio.`,
  editPrompt: (label: string) => `What should I change in the ${label} draft? Reply with text or a voice note.`,
  nothingToReview: "Nothing from that idea is waiting for review.",
} as const;
