/** The pin row with [roomId] moved to [toIndex] (the others keep their order). Every pin then gets its own whole number, 1, 2, 3…, so a move never depends on pins that share a number. */
export function movedIds(shown: string[], roomId: string, toIndex: number): string[] {
  const ids = shown.filter((id) => id !== roomId);
  ids.splice(Math.max(0, Math.min(toIndex, ids.length)), 0, roomId);
  return ids;
}
