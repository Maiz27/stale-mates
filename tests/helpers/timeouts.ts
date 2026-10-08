/**
 * The API's first-move window in e2e runs: playwright.config.ts passes it to the
 * API server as FIRST_MOVE_TIMEOUT_MS (default 30 s) so the abort is testable.
 */
export const FIRST_MOVE_TIMEOUT_MS = 10_000;

/**
 * The API's disconnect grace in e2e runs (DISCONNECT_GRACE_MS, default 60 s),
 * shortened so a no-show abort fits in a test.
 */
export const DISCONNECT_GRACE_MS = 20_000;
