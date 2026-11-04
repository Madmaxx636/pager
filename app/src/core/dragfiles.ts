/** True when a drag carries files from outside the page (not selected text, not a pin or message dragged inside the app). */
export const hasFiles = (e: { dataTransfer: { types: readonly string[] } | null }) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes("Files");

/**
 * A file dropped anywhere the app does not take it would make the browser (or the desktop window) open that file in place of the app.
 * Stops that for the whole window; a chat that wants the files still gets them, because it handles the drop first.
 */
export function installDropGuard() {
  const stop = (e: DragEvent) => { if (hasFiles(e)) e.preventDefault(); };
  window.addEventListener("dragover", stop); window.addEventListener("drop", stop);
}
