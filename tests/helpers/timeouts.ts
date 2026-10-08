/**
 * The API's first-move window in e2e runs: playwright.config.ts passes it to the
 * API server as FIRST_MOVE_TIMEOUT_MS (default 30 s) so the abort is testable.
 */
export const FIRST_MOVE_TIMEOUT_MS = 10_000;
