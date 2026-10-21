import { describe, expect, it } from 'vitest';
import {
  MAX_HISTORY_DAYS,
  appendSnapshot,
  makeSnapshot,
  readHistory,
  recentHistory,
  seriesDelta,
} from './history.js';
import { createInitialWorld } from './create-world.js';
import { applyWorldAction } from './reducer.js';
import { emptyPnL } from '../sales/pnl.js';

/**
 * 每日快照。
 *
 * `pnl` 是累計值 —— 看得到「現在賺多少」，看不到「哪一天開始賺」。
 * 資料面板的趨勢圖需要時間序列，所以日結時追加一筆。
 */
describe('每日快照', () => {
  it('新開局沒有歷史（舊存檔也一樣）', () => {
    const state = createInitialWorld();
    expect(readHistory(state)).toEqual([]);
  });

  it('推進一天就多一筆，且天數正確', () => {
    let state = createInitialWorld();
    expect(readHistory(state)).toHaveLength(0);
    state = applyWorldAction(state, { type: 'ADVANCE_DAY' });
    const history = readHistory(state);
    expect(history).toHaveLength(1);
    expect(history[0]!.day).toBe(1);
    state = applyWorldAction(state, { type: 'ADVANCE_DAY' });
    expect(readHistory(state)).toHaveLength(2);
    expect(readHistory(state)[1]!.day).toBe(2);
  });

  it('快照會記下現金與淨利', () => {
    let state = createInitialWorld({ startingCash: 123_456 });
    state = applyWorldAction(state, { type: 'ADVANCE_DAY' });
    const snap = readHistory(state)[0]!;
    expect(typeof snap.cash).toBe('number');
    expect(typeof snap.netProfit).toBe('number');
    expect(Number.isFinite(snap.cash)).toBe(true);
    expect(Number.isFinite(snap.netProfit)).toBe(true);
  });

  it('同一天重複寫入會覆蓋，不會重複', () => {
    const one = appendSnapshot([], {
      day: 3,
      cash: 100,
      netProfit: 1,
      revenue: 0,
      consumerRevenue: 0,
      share: 0,
    });
    const two = appendSnapshot(one, {
      day: 3,
      cash: 200,
      netProfit: 2,
      revenue: 0,
      consumerRevenue: 0,
      share: 0,
    });
    expect(two).toHaveLength(1);
    expect(two[0]!.cash).toBe(200);
  });

  it('歷史長度有上限（避免存檔無限膨脹）', () => {
    const full = Array.from({ length: MAX_HISTORY_DAYS }, (_, i) => ({
      day: i + 1,
      cash: 0,
      netProfit: 0,
      revenue: 0,
      consumerRevenue: 0,
      share: 0,
    }));
    const next = appendSnapshot(full, {
      day: MAX_HISTORY_DAYS + 1,
      cash: 1,
      netProfit: 1,
      revenue: 0,
      consumerRevenue: 0,
      share: 0,
    });
    expect(next).toHaveLength(MAX_HISTORY_DAYS);
    // 最舊的被裁掉
    expect(next[0]!.day).toBe(2);
    expect(next[next.length - 1]!.day).toBe(MAX_HISTORY_DAYS + 1);
  });

  it('recentHistory 取最近幾天，且保持由舊到新', () => {
    const history = [1, 2, 3, 4, 5].map((day) => ({
      day,
      cash: day,
      netProfit: day,
      revenue: 0,
      consumerRevenue: 0,
      share: 0,
    }));
    const state = { ...createInitialWorld(), history } as ReturnType<typeof createInitialWorld>;
    expect(recentHistory(state, 2).map((s) => s.day)).toEqual([4, 5]);
    expect(recentHistory(state, 0)).toEqual([]);
    expect(recentHistory(state, 99)).toHaveLength(5);
  });

  it('seriesDelta 算出首尾變化', () => {
    expect(seriesDelta([])).toBe(0);
    expect(seriesDelta([5])).toBe(0);
    expect(seriesDelta([10, 20, 35])).toBe(25);
    expect(seriesDelta([35, 10])).toBe(-25);
  });

  it('makeSnapshot 會四捨五入並把市佔縮成小數', () => {
    const snap = makeSnapshot({
      day: 1,
      cash: 1000.6,
      pnl: { ...emptyPnL(), revenue: 500.4 },
      consumerRevenue: 200.5,
      share: 0.12345,
    });
    expect(snap.cash).toBe(1001);
    expect(snap.revenue).toBe(500);
    expect(snap.consumerRevenue).toBe(201);
    expect(snap.share).toBe(0.123);
  });
});
