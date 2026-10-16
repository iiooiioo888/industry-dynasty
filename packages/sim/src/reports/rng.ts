export type Rng = () => number;

/** mulberry32。相同種子得到相同序列。 */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function deriveGameSeed(baseSeed: number, gameIndex: number): number {
  const mixed = Math.imul((baseSeed ^ Math.imul(gameIndex + 1, 0x9e3779b1)) >>> 0, 0x85ebca6b);
  return mixed >>> 0;
}

export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const next = [...items];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const swap = next[i]!;
    next[i] = next[j]!;
    next[j] = swap;
  }
  return next;
}
