import { isBotUser, realPeople, type ChatState } from "./types";

/** Where each face sits inside a group's round picture (x, y and width, as fractions of the circle's width), like iMessage: one big, the rest smaller around it. */
export function faceLayout(n: number): { x: number; y: number; d: number }[] {
  if (n <= 1) return [{ x: 0, y: 0, d: 1 }];
  if (n === 2) return [{ x: 0.02, y: 0.1, d: 0.58 }, { x: 0.4, y: 0.38, d: 0.58 }];
  if (n === 3) return [{ x: 0.05, y: 0.08, d: 0.56 }, { x: 0.5, y: 0.1, d: 0.42 }, { x: 0.3, y: 0.52, d: 0.46 }];
  return [{ x: 0.04, y: 0.1, d: 0.54 }, { x: 0.56, y: 0.04, d: 0.38 }, { x: 0.58, y: 0.46, d: 0.38 }, { x: 0.22, y: 0.6, d: 0.34 }];
}

export interface Face { name: string; mxc?: string }
/** Up to four people in a group, not counting you or any bridge bot: the faces for its round picture. */
export function groupFaces(c: ChatState, me: string): Face[] {
  return realPeople(c.members).filter(([id]) => id !== me && !isBotUser(id)).slice(0, 4).map(([id, name]) => ({ name, mxc: c.memberAvatars?.[id] }));
}
