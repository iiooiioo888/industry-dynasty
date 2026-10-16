import { describe, expect, it } from 'vitest';
import { SIM_PACKAGE_VERSION, createInitialWorld } from './index.js';

describe('@industry-dynasty/sim', () => {
  it('exports sprint 1 package version', () => {
    expect(SIM_PACKAGE_VERSION).toBe('0.1.0-sprint1');
  });

  it('creates a world with auctions for every parcel', () => {
    const state = createInitialWorld({ mapWidth: 4, mapHeight: 3 });
    expect(state.map.parcels).toHaveLength(12);
    expect(state.auctionLots.filter((l) => l.status === 'open')).toHaveLength(12);
  });
});
