import { describe, expect, it } from 'vitest';
import { generateParcelResource } from './parcel-resources.js';

describe('地皮獨有資源', () => {
  it('相同座標產生相同資源', () => {
    const a = generateParcelResource(3, 7);
    const b = generateParcelResource(3, 7);
    expect(a).toEqual(b);
  });

  it('不同座標通常產生不同儲量或種類', () => {
    const a = generateParcelResource(0, 0);
    const b = generateParcelResource(5, 9);
    const differs =
      a.kind !== b.kind || a.reserves !== b.reserves || a.richness !== b.richness;
    expect(differs).toBe(true);
  });
});
