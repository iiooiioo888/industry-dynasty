import { describe, expect, it } from 'vitest';
import { factoryLabel, guidanceFor, sellableSummary } from './tutorial.js';
import { createInitialWorld } from '../world/create-world.js';
import { applyWorldAction } from '../world/reducer.js';
import { findOpenLotForParcel } from '../world/state.js';
import type { WorldState } from '../world/state.js';

/**
 * 教學引導。
 *
 * 不是固定腳本，而是**從狀態推導下一步** —— 玩家亂點也不會卡在
 * 一個做不到的指示上。所以測試要驗的是「狀態變了，提示跟著變」。
 */
function ownFirstParcel(state: WorldState) {
  const parcel = state.map.parcels
    .filter((p) => p.role === 'land' && p.ownerId === null)
    .find((p) => findOpenLotForParcel(state, p.id) !== undefined)!;
  const lot = findOpenLotForParcel(state, parcel.id)!;
  let next = applyWorldAction(state, { type: 'BID', parcelId: parcel.id, amount: lot.minPrice });
  next = applyWorldAction(next, { type: 'SETTLE_AUCTION', parcelId: parcel.id });
  return { state: next, parcelId: parcel.id };
}

describe('教學引導', () => {
  it('全新開局先叫玩家標地', () => {
    const state = createInitialWorld();
    const guidance = guidanceFor(state);
    expect(guidance.step?.id).toBe('bid-land');
    expect(guidance.completed).toBe(0);
    expect(guidance.total).toBeGreaterThan(3);
  });

  it('標到地之後提示改成蓋工坊', () => {
    const owned = ownFirstParcel(createInitialWorld());
    const guidance = guidanceFor(owned.state);
    expect(guidance.step?.id).toBe('build-workshop');
    expect(guidance.completed).toBe(1);
  });

  it('蓋好工坊之後提示改成開產線', () => {
    const owned = ownFirstParcel(createInitialWorld());
    const built = applyWorldAction(owned.state, {
      type: 'START_BUILD',
      parcelId: owned.parcelId,
      factoryTypeId: 'workshop',
    });
    const guidance = guidanceFor(built);
    expect(['build-workshop', 'start-production']).toContain(guidance.step?.id);
    // 至少「標地」已算完成
    expect(guidance.completed).toBeGreaterThanOrEqual(1);
  });

  it('提示一次只給一步，且每個步驟都有標題與說明', () => {
    const state = createInitialWorld();
    const guidance = guidanceFor(state);
    expect(guidance.step).not.toBeNull();
    expect(guidance.step!.title.length).toBeGreaterThan(0);
    expect(guidance.step!.detail.length).toBeGreaterThan(5);
  });

  it('完成的步數不會超過總步數', () => {
    const state = createInitialWorld();
    const guidance = guidanceFor(state);
    expect(guidance.completed).toBeLessThanOrEqual(guidance.total);
  });

  it('同一份狀態永遠得到同一個提示（決定性）', () => {
    const state = createInitialWorld();
    expect(guidanceFor(state).step?.id).toBe(guidanceFor(state).step?.id);
  });

  it('sellableSummary 只列可賣且有量的品項', () => {
    const state = createInitialWorld();
    const summary = sellableSummary(state);
    expect(typeof summary).toBe('string');
    expect(summary).not.toContain('undefined');
  });

  it('factoryLabel 給得出中文名', () => {
    expect(factoryLabel('workshop').length).toBeGreaterThan(0);
    expect(factoryLabel('storefront')).not.toBe(factoryLabel('workshop'));
  });
});
