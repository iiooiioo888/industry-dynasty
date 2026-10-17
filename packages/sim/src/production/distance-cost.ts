/**
 * 距離成本曲線 · distance cost curves
 *
 * 「空間效率 × 時間規劃 = 利潤」是核心迴圈，所以距離懲罰必須**在整張地圖上都還有梯度**。
 * 這個模組把所有距離相關係數集中成一張可掃描的參數表，並提供兩種曲線形狀：
 *
 * - `clamped-linear`：舊行為 `max(floor, 1 - d*falloff)`。會在
 *   `d = (1-floor)/falloff` 之後完全飽和，該區間所有地塊成本相同 —— 空間決策失效。
 * - `soft-exponential`：`floor + (1-floor) * exp(-d/scale)`。**永不歸零**，
 *   每多一格都仍然有代價，但邊際遞減，所以近址差異明顯、遠址差異細微。
 *
 * 座標距離一律使用曼哈頓距離，與 `world/pathfinding.ts` 的路網分開：
 * 這裡量的是「到樞紐的帳面距離」，路網另行透過 roadAccess 影響 logisticsEfficiency。
 */
import type { Parcel } from '../types/map.js';

/** 供應樞紐：原物料與人力的帳面起點。 */
export const SUPPLY_HUB = { x: 0, y: 0 };

export function manhattanToSupplyHub(parcel: Parcel): number {
  return Math.abs(parcel.x - SUPPLY_HUB.x) + Math.abs(parcel.y - SUPPLY_HUB.y);
}

export type DistanceCurveShape = 'clamped-linear' | 'soft-exponential';

export interface ThroughputCurveConfig {
  readonly shape: DistanceCurveShape;
  /** 曲線下界；soft-exponential 的下界在 d→∞ 時才逼近，不會提前觸及。 */
  readonly floor: number;
  /** clamped-linear 用：每格線性衰減量。 */
  readonly falloffPerTile: number;
  /** soft-exponential 用：衰減尺度，越大越平緩。 */
  readonly scale: number;
}

export interface IdleLossCurveConfig {
  readonly shape: DistanceCurveShape;
  /** 每格基礎閒置成本。 */
  readonly perTileWeight: number;
  /** 行程時間每 tick 的額外閒置成本。 */
  readonly perTravelTickWeight: number;
  /** 上限；soft-exponential 下為漸近上限，不會提前觸及。 */
  readonly cap: number;
}

export interface DistanceCostConfig {
  readonly throughput: ThroughputCurveConfig;
  readonly idle: IdleLossCurveConfig;
}

/**
 * 預設值改用 soft-exponential，修正 16×12 出貨地圖上
 * 「曼哈頓距離 ≥ 15 的 40.6% 地塊完全同價」的飽和問題。
 * 近址數值刻意與舊 clamped-linear 盡量接近，讓既有平衡不至於被大幅推翻。
 */
export const DEFAULT_DISTANCE_COST: DistanceCostConfig = {
  throughput: { shape: 'soft-exponential', floor: 0.2, falloffPerTile: 0.045, scale: 11 },
  idle: { shape: 'soft-exponential', perTileWeight: 6, perTravelTickWeight: 4, cap: 130 },
};

/** 舊行為的參數組合，供回歸比對與 A/B 掃描使用。 */
export const LEGACY_DISTANCE_COST: DistanceCostConfig = {
  throughput: { shape: 'clamped-linear', floor: 0.35, falloffPerTile: 0.045, scale: 11 },
  idle: { shape: 'clamped-linear', perTileWeight: 6, perTravelTickWeight: 4, cap: 90 },
};

/** 產出係數：d = 0 時為 1，隨距離單調遞減。 */
export function throughputCurve(
  distance: number,
  cfg: ThroughputCurveConfig = DEFAULT_DISTANCE_COST.throughput,
): number {
  const d = Math.max(0, distance);
  if (d === 0) {
    return 1;
  }
  if (cfg.shape === 'clamped-linear') {
    return Math.max(cfg.floor, 1 - d * cfg.falloffPerTile);
  }
  return cfg.floor + (1 - cfg.floor) * Math.exp(-d / Math.max(cfg.scale, 1e-6));
}

/** 閒置損失：d = 0 時為 0，隨距離單調遞增。 */
export function idleLossCurve(
  distance: number,
  travelTicks: number,
  cfg: IdleLossCurveConfig = DEFAULT_DISTANCE_COST.idle,
): number {
  const d = Math.max(0, distance);
  const raw = d * cfg.perTileWeight + Math.max(0, travelTicks) * cfg.perTravelTickWeight;
  if (d === 0) {
    return 0;
  }
  if (cfg.shape === 'clamped-linear') {
    return Math.min(cfg.cap, Math.round(raw));
  }
  return Math.round(cfg.cap * (1 - Math.exp(-raw / cfg.cap)));
}

/**
 * clamped-linear 曲線的飽和距離：`d >= 此值` 之後成本完全相同。
 * soft-exponential 回傳 `null`，代表沒有任何距離會提前飽和。
 * 提供這個函式是為了讓「曲線是否有死區」變成可被測試與掃描的事實，而不是口頭假設。
 */
export function saturationDistance(cfg: ThroughputCurveConfig): number | null {
  if (cfg.shape !== 'clamped-linear') {
    return null;
  }
  if (cfg.falloffPerTile <= 0) {
    return null;
  }
  return Math.ceil((1 - cfg.floor) / cfg.falloffPerTile);
}

/** 閒置損失曲線的飽和距離；soft-exponential 回傳 `null`。 */
export function idleSaturationDistance(cfg: IdleLossCurveConfig): number | null {
  if (cfg.shape !== 'clamped-linear') {
    return null;
  }
  const perTile = cfg.perTileWeight + cfg.perTravelTickWeight;
  if (perTile <= 0) {
    return null;
  }
  return Math.ceil(cfg.cap / perTile);
}

/** 最大值為 `width-1 + height-1` 的地圖上，有多少比例地塊落在 `d >= limit`。 */
export function shareOfMapBeyond(
  width: number,
  height: number,
  limit: number,
): { count: number; total: number; share: number } {
  let count = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (x + y >= limit) {
        count += 1;
      }
    }
  }
  const total = width * height;
  return { count, total, share: count / total };
}
