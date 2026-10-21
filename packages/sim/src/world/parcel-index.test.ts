import { describe, expect, it } from 'vitest';
import { parcelIndex, parcelsOwnedBy } from './parcel-index.js';
import { createInitialWorld } from './create-world.js';
import { findParcel, getPlayerHoldings } from './state.js';
import { getParcelAt } from '../buildings/adjacency.js';
import { applyWorldAction } from './reducer.js';
import { parcelIdFromCoords } from '../types/map.js';
import { findOpenLotForParcel } from './state.js';

/**
 * 地塊索引的正確性。
 *
 * 索引是純效能優化（原本是 `Array.prototype.find` 線性掃描），
 * 因此它**必須**與線性掃描完全等價，包含「重複鍵取第一個」這種邊界行為。
 */
describe('地塊索引與線性掃描等價', () => {
  const world = createInitialWorld({});
  const { width, height } = world.map.size;

  it('座標查詢涵蓋整個地圖，含邊界外', () => {
    for (let y = -1; y <= height; y += 1) {
      for (let x = -1; x <= width; x += 1) {
        const expected = world.map.parcels.find((p) => p.x === x && p.y === y);
        const actual = getParcelAt(world.map, x, y);
        expect(actual?.id.value, `(${x},${y})`).toBe(expected?.id.value);
      }
    }
  });

  it('id 查詢對每一塊地都與 findParcel 相同', () => {
    for (const parcel of world.map.parcels) {
      expect(findParcel(world, parcel.id)?.x).toBe(parcel.x);
      expect(findParcel(world, parcel.id)?.y).toBe(parcel.y);
    }
  });

  it('非標準 id 會退回完整 Map，不會誤匹配', () => {
    const index = parcelIndex(world.map.parcels, width, height);
    // 座標合法但 id 不是 `${x},${y}` 格式 → 必須退回 Map 查詢
    expect(index.byIdValue('not-a-coordinate')).toBeUndefined();
    expect(index.byIdValue('0,0')).toBeDefined();
    // 不存在的座標
    expect(index.byIdValue(`${width + 5},0`)).toBeUndefined();
  });

  it('持有地塊與 filter 的內容與順序相同', () => {
    for (const playerId of ['nobody', world.localPlayerId]) {
      const expected = world.map.parcels.filter((p) => p.ownerId === playerId);
      const actual = getPlayerHoldings(world, playerId);
      expect(actual.map((p) => p.id.value)).toEqual(expected.map((p) => p.id.value));
    }
  });

  it('地塊陣列換版本後索引會失效（蓋路後查得到新角色）', () => {
    const buyable = world.map.parcels
      .filter((p) => p.role === 'land' && p.ownerId === null)
      .find((p) => findOpenLotForParcel(world, p.id) !== undefined);
    expect(buyable).toBeDefined();
    const lot = findOpenLotForParcel(world, buyable!.id)!;

    let next = applyWorldAction(world, {
      type: 'BID',
      parcelId: buyable!.id,
      amount: lot.minPrice,
    });
    next = applyWorldAction(next, { type: 'SETTLE_AUCTION', parcelId: buyable!.id });

    const after = getParcelAt(next.map, buyable!.x, buyable!.y);
    expect(after?.ownerId).toBe(next.localPlayerId);
    // 舊地圖不受影響
    expect(getParcelAt(world.map, buyable!.x, buyable!.y)?.ownerId).toBeNull();
  });

  it('parcelsOwnedBy 的快取不會跨版本污染', () => {
    const before = parcelsOwnedBy(world.map.parcels, world.localPlayerId).length;
    const other = world.map.parcels.map((p) => ({ ...p, ownerId: world.localPlayerId }));
    const after = parcelsOwnedBy(other, world.localPlayerId).length;
    expect(before).toBe(0);
    expect(after).toBe(other.length);
    // 原陣列的快取仍是舊結果
    expect(parcelsOwnedBy(world.map.parcels, world.localPlayerId).length).toBe(0);
  });

  it('parcelIdFromCoords 的 id 能直接命中座標快路徑', () => {
    const index = parcelIndex(world.map.parcels, width, height);
    const target = world.map.parcels[0]!;
    const id = parcelIdFromCoords(target.x, target.y).value;
    expect(index.byIdValue(id)?.id.value).toBe(target.id.value);
  });
});
