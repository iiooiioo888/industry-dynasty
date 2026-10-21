import { describe, expect, it } from 'vitest';
import { SAVE_VERSION, parseSave, serializeGame, validateStateShape } from './save.js';
import { createInitialWorld } from '../world/create-world.js';
import { applyWorldAction } from '../world/reducer.js';
import { findOpenLotForParcel } from '../world/state.js';

function worldWithSomeProgress() {
  let state = createInitialWorld({ startingCash: 120_000 });
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
  state = applyWorldAction(state, { type: 'ADVANCE_DAY' });
  return state;
}

/**
 * 存檔／讀檔。
 *
 * `WorldState` 是純資料，所以可以直接 JSON 化。這個模組的價值在於
 * **版本號**與**讀取時驗證** —— 壞掉的存檔要明確報錯，
 * 而不是讓殘缺狀態流進 reducer 變成 NaN。
 */
describe('存檔／讀檔', () => {
  it('往返後狀態一致（純資料可完整還原）', () => {
    const state = worldWithSomeProgress();
    const json = serializeGame(state, { now: new Date('2026-01-02T03:04:05.000Z') });
    const result = parseSave(json);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }
    expect(result.save.version).toBe(SAVE_VERSION);
    expect(result.save.savedAtIso).toBe('2026-01-02T03:04:05.000Z');
    expect(result.save.state).toEqual(state);
  });

  it('往返後可以繼續推進遊戲', () => {
    const state = worldWithSomeProgress();
    const parsed = parseSave(serializeGame(state));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    const continued = applyWorldAction(parsed.save.state, { type: 'ADVANCE_DAY' });
    expect(continued.gameDay).toBe(parsed.save.state.gameDay + 1);
  });

  it('存檔不含函式或不可序列化的值', () => {
    const json = serializeGame(worldWithSomeProgress());
    const parsed = JSON.parse(json) as { state: Record<string, unknown> };
    const walk = (value: unknown): void => {
      expect(typeof value).not.toBe('function');
      expect(typeof value).not.toBe('bigint');
      if (Array.isArray(value)) {
        value.forEach(walk);
      } else if (value && typeof value === 'object') {
        Object.values(value).forEach(walk);
      }
    };
    walk(parsed.state);
  });

  it('壞掉的 JSON 會明確失敗，不丟例外', () => {
    const result = parseSave('{ this is not json');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('JSON');
    }
  });

  it('缺少版本號會被拒絕', () => {
    const result = parseSave(JSON.stringify({ state: {} }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('版本');
    }
  });

  it('版本比遊戲新會被拒絕（不會誤讀新格式）', () => {
    const state = worldWithSomeProgress();
    const result = parseSave(JSON.stringify({ version: SAVE_VERSION + 5, savedAtIso: '', state }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('比遊戲新');
    }
  });

  it('缺少必要欄位會被拒絕，並指出是哪一個', () => {
    const state = worldWithSomeProgress() as unknown as Record<string, unknown>;
    const broken = { ...state };
    delete broken.map;
    const result = parseSave(
      JSON.stringify({ version: SAVE_VERSION, savedAtIso: '', state: broken }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('map');
    }
  });

  it('地圖尺寸不正確會被拒絕', () => {
    const state = worldWithSomeProgress() as unknown as Record<string, unknown>;
    const map = { ...(state.map as Record<string, unknown>), size: { width: 'x' } };
    const result = parseSave(
      JSON.stringify({ version: SAVE_VERSION, savedAtIso: '', state: { ...state, map } }),
    );
    expect(result.ok).toBe(false);
  });

  it('舊存檔缺少選填欄位時可以讀，並回報警告', () => {
    const state = worldWithSomeProgress() as unknown as Record<string, unknown>;
    const legacy = { ...state };
    delete legacy.commerce;
    delete legacy.shipments;
    const result = parseSave(
      JSON.stringify({ version: SAVE_VERSION, savedAtIso: '', state: legacy }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.join()).toContain('門市');
    }
  });

  it('validateStateShape 對正常狀態回傳 null', () => {
    expect(validateStateShape(worldWithSomeProgress())).toBeNull();
  });

  it('validateStateShape 對非物件明確失敗', () => {
    expect(validateStateShape(null)).toContain('物件');
    expect(validateStateShape([])).toContain('物件');
    expect(validateStateShape(42)).toContain('物件');
  });
});
