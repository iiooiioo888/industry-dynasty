import { describe, expect, it } from 'vitest';
import { landSaleBoard } from './land-sale.js';
import { createInitialWorld } from '../world/create-world.js';
import { applyWorldAction } from '../world/reducer.js';
import { findOpenLotForParcel } from '../world/state.js';
import type { WorldState } from '../world/state.js';

/**
 * 賣地看板。
 *
 * `SELL_LAND` 早就實作了（含估價、增值係數、轉手折價、排除礦脈避免套利），
 * 但一直沒有 UI。這個看板是它的入口。
 */
function ownFirstParcel(state: WorldState) {
  const parcel = state.map.parcels
    .filter((p) => p.role === 'land' && p.ownerId === null)
    .find((p) => findOpenLotForParcel(state, p.id) !== undefined)!;
  const lot = findOpenLotForParcel(state, parcel.id)!;
  let next = applyWorldAction(state, { type: 'BID', parcelId: parcel.id, amount: lot.minPrice });
  next = applyWorldAction(next, { type: 'SETTLE_AUCTION', parcelId: parcel.id });
  return { state: next, parcelId: parcel.id, paid: lot.minPrice };
}

describe('賣地看板', () => {
  it('沒有土地時是空的', () => {
    const board = landSaleBoard(createInitialWorld());
    expect(board.rows).toHaveLength(0);
    expect(board.sellable).toBe(0);
    expect(board.totalProceeds).toBe(0);
  });

  it('持有土地後會列出估價與可入帳金額', () => {
    const owned = ownFirstParcel(createInitialWorld({ startingCash: 300_000 }));
    const board = landSaleBoard(owned.state);
    expect(board.rows).toHaveLength(1);
    const row = board.rows[0]!;
    expect(row.parcelKey).toBe(owned.parcelId.value);
    expect(row.appraisedValue).toBeGreaterThan(0);
    expect(row.proceeds).toBeGreaterThan(0);
    expect(row.proceeds).toBeLessThanOrEqual(row.appraisedValue);
    expect(row.canSell).toBe(true);
    expect(row.blockedReason).toBeNull();
  });

  it('沒有建築時可以賣', () => {
    const owned = ownFirstParcel(createInitialWorld({ startingCash: 300_000 }));
    expect(landSaleBoard(owned.state).sellable).toBe(1);
  });

  it('地上有建築時不能賣，並說明原因', () => {
    const owned = ownFirstParcel(createInitialWorld({ startingCash: 400_000 }));
    const built = applyWorldAction(owned.state, {
      type: 'START_BUILD',
      parcelId: owned.parcelId,
      factoryTypeId: 'workshop',
    });
    const board = landSaleBoard(built);
    const row = board.rows[0]!;
    expect(row.canSell).toBe(false);
    expect(row.blockedReason).not.toBeNull();
    expect(board.sellable).toBe(0);
  });

  it('有拍賣紀錄時會算出賺賠', () => {
    const owned = ownFirstParcel(createInitialWorld({ startingCash: 300_000 }));
    const row = landSaleBoard(owned.state).rows[0]!;
    // 成交價就是 costBasis；轉手折價會讓 gain 為負（或至少算得出來）
    expect(row.costBasis).not.toBeNull();
    expect(row.costBasis).toBeGreaterThan(0);
    expect(row.gain).toBe(row.proceeds - row.costBasis!);
    expect(row.advice).toContain('比買價');
  });

  it('總入帳只算可賣的土地', () => {
    const owned = ownFirstParcel(createInitialWorld({ startingCash: 300_000 }));
    const board = landSaleBoard(owned.state);
    expect(board.totalProceeds).toBe(
      board.rows.filter((row) => row.canSell).reduce((sum, row) => sum + row.proceeds, 0),
    );
  });

  it('清單排序穩定', () => {
    const board = landSaleBoard(
      ownFirstParcel(createInitialWorld({ startingCash: 300_000 })).state,
    );
    const keys = board.rows.map((row) => row.parcelKey);
    expect([...keys].sort()).toEqual(keys);
  });
});
