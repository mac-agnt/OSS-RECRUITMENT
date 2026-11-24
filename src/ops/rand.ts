/* Deterministic helpers for the seed and the simulated crew. No Math.random:
   the same day always produces the same demo. */

/** FNV-1a 32-bit hash of a string. */
export function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Number in [0, n) from a key. */
export const roll = (key: string, n: number) => hash(key) % n;

/** True for roughly pct percent of keys. */
export const chance = (key: string, pct: number) => roll(key, 100) < pct;

export const pick = <T>(list: readonly T[], key: string): T => list[roll(key, list.length)];

/** Stable shuffle by key. */
export function shuffle<T>(list: readonly T[], key: string): T[] {
  return list.map((x, i) => ({ x, k: hash(key + ":" + i) })).sort((a, b) => a.k - b.k).map((o) => o.x);
}
