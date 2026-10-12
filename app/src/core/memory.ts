/** Messages kept per chat on this device; older ones are fetched from the server again when scrolling up. */
export const KEEP_MESSAGES = 300;
/** How long pulled-in history is kept after the reader leaves it: 12 minutes, shrinking to 2 as more is pulled (500 messages in the chat = the shortest). */
export const poolClearMs = (messages: number) => Math.round(12 * 60_000 - 10 * 60_000 * Math.min(1, Math.max(0, (messages - KEEP_MESSAGES) / 200)));
