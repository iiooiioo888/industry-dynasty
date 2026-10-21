import {
  parseSave,
  serializeGame,
  type SaveParseResult,
  type WorldState,
} from '@industry-dynasty/sim';

/**
 * 瀏覽器端的存檔層。
 *
 * 遊戲狀態本身是純資料，序列化與驗證都在 `@industry-dynasty/sim` 的
 * `persistence/save.ts`。這裡只負責 localStorage 的讀寫與錯誤容忍：
 * - 存檔失敗（例如容量爆掉、隱私模式）不該讓遊戲崩掉
 * - 讀到壞存檔時回傳原因，由 UI 顯示
 */
const STORAGE_KEY = 'industry-dynasty/save/v1';

export interface StoredSaveInfo {
  readonly savedAtIso: string;
  readonly gameDay: number;
}

export type LoadResult =
  | { readonly ok: true; readonly state: WorldState; readonly warnings: readonly string[] }
  | { readonly ok: false; readonly reason: string };

function storage(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return null;
    }
    return window.localStorage;
  } catch {
    // 隱私模式或停用儲存時存取會丟例外
    return null;
  }
}

export function saveGame(state: WorldState): { readonly ok: boolean; readonly reason?: string } {
  const target = storage();
  if (!target) {
    return { ok: false, reason: '這個瀏覽器不允許本機儲存' };
  }
  try {
    target.setItem(STORAGE_KEY, serializeGame(state));
    return { ok: true };
  } catch {
    return { ok: false, reason: '存檔失敗（可能是儲存空間已滿）' };
  }
}

export function loadGame(): LoadResult {
  const target = storage();
  if (!target) {
    return { ok: false, reason: '這個瀏覽器不允許本機儲存' };
  }
  const raw = target.getItem(STORAGE_KEY);
  if (raw === null) {
    return { ok: false, reason: '沒有存檔' };
  }
  const parsed: SaveParseResult = parseSave(raw);
  if (!parsed.ok) {
    return { ok: false, reason: parsed.reason };
  }
  return { ok: true, state: parsed.save.state, warnings: parsed.warnings };
}

export function clearSave(): void {
  storage()?.removeItem(STORAGE_KEY);
}

/** 存檔摘要（給按鈕顯示「上次存檔：第 N 天」）。 */
export function readSaveInfo(): StoredSaveInfo | null {
  const target = storage();
  const raw = target?.getItem(STORAGE_KEY);
  if (!raw) {
    return null;
  }
  const parsed = parseSave(raw);
  if (!parsed.ok) {
    return null;
  }
  return {
    savedAtIso: parsed.save.savedAtIso,
    gameDay: parsed.save.state.gameDay,
  };
}
