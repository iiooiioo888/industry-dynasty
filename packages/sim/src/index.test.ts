import { describe, expect, it } from 'vitest';
import { SIM_PACKAGE_VERSION, createInitialWorld } from './index.js';

describe('@industry-dynasty/sim', () => {
  it('exports sprint 4 package version', () => {
    expect(SIM_PACKAGE_VERSION).toBe('0.4.0-sprint4');
  });

  it('creates a world whose auctions cover purchasable land only', () => {
    const state = createInitialWorld({ mapWidth: 4, mapHeight: 3 });
    expect(state.map.parcels).toHaveLength(12);
    const land = state.map.parcels.filter((p) => p.role === 'land');
    expect(land.length).toBeLessThan(12);
    expect(state.auctionLots.filter((l) => l.status === 'open')).toHaveLength(land.length);
  });
});
