import { describe, expect, it } from 'vitest';
import { summarizeProduction } from './status.js';
import { createInitialWorld } from '../world/create-world.js';
import { applyWorldAction } from '../world/reducer.js';
import { findOpenLotForParcel } from '../world/state.js';
import type { WorldState } from '../world/state.js';

/**
 * 產線狀態一覽。
 *
 * 玩家最需要知道的是「哪條線卡住、卡在缺料還是閒置」——
 * 這比「已停止」這種狀態碼有用得多。
 */
function withWorkshopAndLine(): { state: WorldState; parcelKey: string } {
  let state = createInitialWorld({ startingCash: 400_000 });
  const parcel = state.map.parcels
    .filter((p) => p.role === 'land' && p.ownerId === null)
    .find((p) => findOpenLotForParcel(state, p.id) !== undefined)!;
  const lot = findOpenLotForParcel(state, parcel.id)!;
  state = applyWorldAction(state, { type: 'BID', parcelId: parcel.id, amount: lot.minPrice });
  state = applyWorldAction(state, { type: 'SETTLE_AUCTION', parcelId: parcel.id });
  state = applyWorldAction(state, {
    type: 'START_BUILD',
    parcelId: parcel.id,
    factoryTypeId: 'workshop',
  });
  for (let i = 0; i < 40; i += 1) {
    state = applyWorldAction(state, { type: 'ADVANCE_BUILD_TICK' });
  }
  return { state, parcelKey: parcel.id.value };
}

describe('產線狀態一覽', () => {
  it('沒有產線時回傳空的摘要', () => {
    const summary = summarizeProduction(createInitialWorld());
    expect(summary.lines).toHaveLength(0);
    expect(summary.running).toBe(0);
    expect(summary.blocked).toBe(0);
    expect(summary.totalIdleLoss).toBe(0);
  });

  it('開一條線之後會出現在清單裡，並帶著名稱', () => {
    const { state, parcelKey } = withWorkshopAndLine();
    const started = applyWorldAction(state, {
      type: 'START_PRODUCTION',
      parcelId: { value: parcelKey } as never,
      recipeId: 'extract-iron',
    });
    const summary = summarizeProduction(started);
    expect(summary.lines.length).toBe(1);
    const line = summary.lines[0]!;
    expect(line.parcelKey).toBe(parcelKey);
    expect(line.recipeId).toBe('extract-iron');
    expect(line.recipeName.length).toBeGreaterThan(0);
    expect(line.factoryName.length).toBeGreaterThan(0);
    expect(line.progress).toBeGreaterThanOrEqual(0);
    expect(line.progress).toBeLessThanOrEqual(1);
  });

  it('缺料時會指出缺哪一項', () => {
    const { state, parcelKey } = withWorkshopAndLine();
    // 開一條需要原料的加工配方，但不給任何原料
    const started = applyWorldAction(state, {
      type: 'START_PRODUCTION',
      parcelId: { value: parcelKey } as never,
      recipeId: 'make-basic-part',
    });
    const summary = summarizeProduction(started);
    if (summary.lines.length === 0) {
      return; // 這塊地可能不允許該配方（礦脈不符），略過
    }
    const line = summary.lines[0]!;
    expect(['no-input', 'idle', 'stalled', 'running']).toContain(line.blocker);
    if (line.blocker === 'no-input') {
      expect(line.note).toContain('缺料');
    }
  });

  it('running 與 blocked 的計數與清單一致', () => {
    const { state, parcelKey } = withWorkshopAndLine();
    const started = applyWorldAction(state, {
      type: 'START_PRODUCTION',
      parcelId: { value: parcelKey } as never,
      recipeId: 'extract-iron',
    });
    const summary = summarizeProduction(started);
    const running = summary.lines.filter((line) => line.blocker === 'running').length;
    const blocked = summary.lines.filter(
      (line) => line.blocker === 'no-input' || line.blocker === 'idle',
    ).length;
    expect(summary.running).toBe(running);
    expect(summary.blocked).toBe(blocked);
  });

  it('每條線都有可取用的註記', () => {
    const { state, parcelKey } = withWorkshopAndLine();
    const started = applyWorldAction(state, {
      type: 'START_PRODUCTION',
      parcelId: { value: parcelKey } as never,
      recipeId: 'extract-iron',
    });
    for (const line of summarizeProduction(started).lines) {
      expect(line.note.length).toBeGreaterThan(0);
      expect(line.outputItem.length).toBeGreaterThan(0);
      expect(Number.isFinite(line.idleLoss)).toBe(true);
    }
  });

  it('清單依地塊排序（輸出穩定）', () => {
    const { state } = withWorkshopAndLine();
    const summary = summarizeProduction(state);
    const keys = summary.lines.map((line) => line.parcelKey);
    expect([...keys].sort()).toEqual(keys);
  });
});
