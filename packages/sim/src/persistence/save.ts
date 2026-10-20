import type { WorldState } from '../world/state.js';

/**
 * 存檔／讀檔 · save & load
 *
 * 原本整個遊戲狀態只活在記憶體裡，關掉瀏覽器就歸零。
 *
 * `WorldState` 是**純資料**（物件、陣列、數字、字串），沒有函式、`Map`、`Set`，
 * 所以可以直接 JSON 化。這個模組只做三件事：
 *
 * 1. **加上版本號** —— 沒有版本號的存檔沒辦法安全地改格式。
 * 2. **讀取時驗證** —— 缺欄位或版本不認得就明確失敗，不要讓殘缺狀態跑進 reducer
 *    （那會變成很難追的 NaN 或 undefined 例外）。
 * 3. **保留未知欄位** —— 舊存檔缺少較晚加入的選填欄位（`commerce`、`npcDeals`）
 *    時，由讀取端補空帳，而不是拒絕整個存檔。
 */
export const SAVE_VERSION = 1;

export interface SaveFile {
  readonly version: number;
  /** 存檔時間（ISO 字串），僅供顯示 */
  readonly savedAtIso: string;
  readonly state: WorldState;
}

export type SaveParseResult =
  | { readonly ok: true; readonly save: SaveFile; readonly warnings: readonly string[] }
  | { readonly ok: false; readonly reason: string };

/** 必要欄位：缺任何一個都不該進 reducer。 */
const REQUIRED_KEYS = [
  'map',
  'players',
  'localPlayerId',
  'auctionLots',
  'sites',
  'inventories',
  'craftedTotals',
  'productionLines',
  'gameDay',
  'npcBuyOffers',
  'pnl',
  'scenario',
  'clock',
] as const;

export interface SerializeOptions {
  /** 存檔時間；預設用現在時刻（測試可固定） */
  readonly now?: Date;
}

/** 把狀態包成存檔字串。 */
export function serializeGame(state: WorldState, options: SerializeOptions = {}): string {
  const savedAtIso = (options.now ?? new Date()).toISOString();
  const save: SaveFile = { version: SAVE_VERSION, savedAtIso, state };
  return JSON.stringify(save);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 檢查狀態的基本形狀。
 * 回傳 `null` 表示通過，否則回傳問題描述。
 */
export function validateStateShape(value: unknown): string | null {
  if (!isPlainObject(value)) {
    return '存檔內容不是物件';
  }
  for (const key of REQUIRED_KEYS) {
    if (!(key in value) || value[key] === undefined) {
      return `存檔缺少必要欄位：${key}`;
    }
  }
  const map = value.map;
  if (!isPlainObject(map) || !Array.isArray(map.parcels)) {
    return '存檔的地圖資料不完整';
  }
  const size = map.size;
  if (!isPlainObject(size) || typeof size.width !== 'number' || typeof size.height !== 'number') {
    return '存檔的地圖尺寸不正確';
  }
  if (typeof value.localPlayerId !== 'string') {
    return '存檔缺少玩家識別碼';
  }
  if (!isPlainObject(value.players)) {
    return '存檔的玩家資料不正確';
  }
  if (typeof value.gameDay !== 'number' || !Number.isFinite(value.gameDay)) {
    return '存檔的遊戲天數不正確';
  }
  if (!isPlainObject(value.scenario) || typeof value.scenario.status !== 'string') {
    return '存檔的關卡狀態不正確';
  }
  return null;
}

/**
 * 解析存檔字串。
 *
 * 失敗時回傳原因，**不丟例外** —— 呼叫端（UI）需要的是「告訴玩家這個存檔壞了」，
 * 不是讓整個畫面白掉。
 */
export function parseSave(jsonText: string): SaveParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { ok: false, reason: '存檔不是有效的 JSON' };
  }
  if (!isPlainObject(parsed)) {
    return { ok: false, reason: '存檔格式不正確' };
  }
  const version = parsed.version;
  if (typeof version !== 'number') {
    return { ok: false, reason: '存檔缺少版本號' };
  }
  if (version > SAVE_VERSION) {
    return { ok: false, reason: `存檔版本 ${version} 比遊戲新，請更新遊戲` };
  }
  if (version < 1) {
    return { ok: false, reason: `不支援的存檔版本 ${version}` };
  }
  const shape = validateStateShape(parsed.state);
  if (shape !== null) {
    return { ok: false, reason: shape };
  }
  const state = parsed.state as WorldState;
  const warnings: string[] = [];
  if (state.commerce === undefined) {
    warnings.push('此存檔沒有門市／合約資料，已用空白帳本繼續');
  }
  if (state.shipments === undefined) {
    warnings.push('此存檔沒有在途出貨資料');
  }
  return {
    ok: true,
    save: {
      version,
      savedAtIso: typeof parsed.savedAtIso === 'string' ? parsed.savedAtIso : '',
      state,
    },
    warnings,
  };
}
