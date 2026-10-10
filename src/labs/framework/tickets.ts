/** Deterministic ticket draw for capstones: the same seed always gives the same tickets in the same order. */

/** mulberry32: small seeded PRNG (32-bit state). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Picks `n` items in a seeded order (Fisher–Yates on a copy). */
export function pickSeeded<T>(items: readonly T[], n: number, seed: number): T[] {
  const a = [...items];
  const r = rng(seed);
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, Math.min(n, a.length));
}

export const newSeed = () => 1 + Math.floor(Math.random() * 99999);
