import { describe, expect, it } from 'vitest';
import { MIN_BID_RATIO, findBid, resolveBid, rivalBidFor, upsertBid } from './bidding.js';

/**
 * 合約競標。
 *
 * 原本每座城市每天自動掛出一張合約，價格與數量都固定 —— 接了就有，
 * 沒有競爭。現在每張約都有一個**對手報價**，玩家必須壓過去才標得到。
 */
describe('合約競標', () => {
  const base = {
    contractId: 'contract-xiwan-d0-0',
    itemId: 'hand-tool' as const,
    faceUnitPrice: 1000,
    cityId: 'xiwan',
    gameDay: 3,
  };

  it('對手報價是決定性的', () => {
    const a = rivalBidFor(base);
    const b = rivalBidFor(base);
    expect(a).toBe(b);
  });

  it('對手報價落在面價 ±8% 內', () => {
    for (let day = 0; day < 40; day += 1) {
      for (const cityId of ['xiwan', 'lingang', 'nanzhan']) {
        const rival = rivalBidFor({ ...base, cityId, gameDay: day });
        expect(rival).toBeGreaterThanOrEqual(Math.round(1000 * 0.92) - 1);
        expect(rival).toBeLessThanOrEqual(Math.round(1000 * 1.08) + 1);
      }
    }
  });

  it('不同城市／日期的報價不同（不是固定值）', () => {
    const values = new Set<number>();
    for (let day = 0; day < 20; day += 1) {
      for (const cityId of ['xiwan', 'lingang', 'nanzhan']) {
        values.add(rivalBidFor({ ...base, cityId, gameDay: day }));
      }
    }
    expect(values.size).toBeGreaterThan(5);
  });

  it('出價等於對手 → 剛好壓線得標', () => {
    const rival = 950;
    const outcome = resolveBid({ bidUnitPrice: rival, rivalUnitPrice: rival, faceUnitPrice: 1000 });
    expect(outcome.won).toBe(true);
    expect(outcome.reason).toBeUndefined();
  });

  it('出價低於對手 → 得標', () => {
    const outcome = resolveBid({ bidUnitPrice: 900, rivalUnitPrice: 950, faceUnitPrice: 1000 });
    expect(outcome.won).toBe(true);
  });

  it('出價高於對手 → 被搶走', () => {
    const outcome = resolveBid({ bidUnitPrice: 980, rivalUnitPrice: 950, faceUnitPrice: 1000 });
    expect(outcome.won).toBe(false);
    expect(outcome.reason).toContain('對手');
  });

  it('出價低於底價 → 直接被拒，即使贏過對手', () => {
    const floor = Math.round(1000 * MIN_BID_RATIO);
    const outcome = resolveBid({
      bidUnitPrice: floor - 1,
      rivalUnitPrice: 950,
      faceUnitPrice: 1000,
    });
    expect(outcome.won).toBe(false);
    expect(outcome.reason).toContain('底價');
  });

  it('出價越高越難標到（取捨存在）', () => {
    const cheap = resolveBid({ bidUnitPrice: 800, rivalUnitPrice: 950, faceUnitPrice: 1000 });
    const pricey = resolveBid({ bidUnitPrice: 960, rivalUnitPrice: 950, faceUnitPrice: 1000 });
    expect(cheap.won).toBe(true);
    expect(pricey.won).toBe(false);
  });

  it('同一張合約只保留最新一次出價', () => {
    let bids = upsertBid(undefined, { contractId: 'a', unitPrice: 100, day: 0 });
    bids = upsertBid(bids, { contractId: 'a', unitPrice: 90, day: 1 });
    bids = upsertBid(bids, { contractId: 'b', unitPrice: 50, day: 1 });
    expect(bids.filter((bid) => bid.contractId === 'a')).toHaveLength(1);
    expect(findBid(bids, 'a')?.unitPrice).toBe(90);
    expect(findBid(bids, 'b')?.unitPrice).toBe(50);
  });

  it('查不到出價時回傳 undefined', () => {
    expect(findBid(undefined, 'nope')).toBeUndefined();
    expect(findBid([], 'nope')).toBeUndefined();
  });
});
