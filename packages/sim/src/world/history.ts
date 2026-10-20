import { netProfit } from '../sales/pnl.js';
import type { PnLSummary } from '../sales/pnl.js';
import type { WorldState } from './state.js';

/**
 * 每日快照 · day history
 *
 * `pnl` 是**累計**數字，看不出「哪一天開始賺」或「哪一天崩掉」。
 * 資料面板需要一條時間序列才能畫趨勢。
 *
 * 這裡只在日結時追加一筆，並限制長度 —— 存檔會隨天數線性膨脹，
 * 一局 33 天 × 每筆 6 個數字其實很小，但沒有上限的累積是壞習慣。
 *
 * 舊存檔沒有這個欄位，讀取時視為空陣列。
 */
export interface DaySnapshot {
  readonly day: number;
  readonly cash: number;
  readonly netProfit: number;
  readonly revenue: number;
  readonly consumerRevenue: number;
  readonly share: number;
}

/** 只保留最近這麼多天，避免存檔無限膨脹。 */
export const MAX_HISTORY_DAYS = 120;

export interface SnapshotInput {
  readonly day: number;
  readonly cash: number;
  readonly pnl: PnLSummary;
  readonly consumerRevenue: number;
  readonly share: number;
}

export function makeSnapshot(input: SnapshotInput): DaySnapshot {
  return {
    day: input.day,
    cash: Math.round(input.cash),
    netProfit: Math.round(netProfit(input.pnl)),
    revenue: Math.round(input.pnl.revenue ?? 0),
    consumerRevenue: Math.round(input.consumerRevenue),
    share: Math.round(input.share * 1000) / 1000,
  };
}

/** 追加一筆快照，並裁掉太舊的紀錄。 */
export function appendSnapshot(
  history: readonly DaySnapshot[] | undefined,
  snapshot: DaySnapshot,
): DaySnapshot[] {
  const base = (history ?? []).filter((entry) => entry.day !== snapshot.day);
  const next = [...base, snapshot].sort((a, b) => a.day - b.day);
  return next.length > MAX_HISTORY_DAYS ? next.slice(next.length - MAX_HISTORY_DAYS) : next;
}

/** 讀出歷史（舊存檔相容）。 */
export function readHistory(state: WorldState): readonly DaySnapshot[] {
  return state.history ?? [];
}

/** 最近 n 天的快照（新到舊或舊到新由呼叫端決定，這裡回傳由舊到新）。 */
export function recentHistory(state: WorldState, days: number): readonly DaySnapshot[] {
  const history = readHistory(state);
  if (days <= 0) {
    return [];
  }
  return history.slice(Math.max(0, history.length - days));
}

/** 序列的變化量（最後一筆 − 第一筆），畫趨勢標題用。 */
export function seriesDelta(values: readonly number[]): number {
  if (values.length < 2) {
    return 0;
  }
  return (values[values.length - 1] ?? 0) - (values[0] ?? 0);
}
