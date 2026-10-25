// Drafting limits. Pure constants, so workflow bodies can import them.

export const IDEA_MAX_CHARS = 8_000;

// Read with enforceRateLimit, keyed on the brand.
export const DRAFT_RUNS_PER_HOUR = 20; // prefix "draft:run"
export const REVISIONS_PER_HOUR = 40; // prefix "draft:revise"
