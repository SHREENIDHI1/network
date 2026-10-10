import { describe, expect, it } from 'vitest';
import { pickSeeded } from './tickets';

describe('seeded ticket draw', () => {
  it('is reproducible and draws distinct items', () => {
    const items = Array.from({ length: 21 }, (_, i) => i);
    const a = pickSeeded(items, 10, 4721);
    expect(pickSeeded(items, 10, 4721)).toEqual(a);
    expect(new Set(a).size).toBe(10);
    expect(pickSeeded(items, 10, 4722)).not.toEqual(a);
    expect(pickSeeded(items, 50, 1)).toHaveLength(21);
  });
});
