import type { Parcel } from '../types/map.js';

/**
 * 產品品質分級 · quality tiers
 *
 * 原型《創業王》的 108 種產品各有「品質／速度適合的土壤與水質」，
 * 也就是**地點會決定品質上限**。本專案原本只有 `qualityBand: 0 | 1`
 * 兩檔，而且是全公司一個全域值 —— 研發完成就升到 1，地點毫無影響。
 *
 * 這裡補上第三檔，並讓它**受地點限制**：
 * - 第 0 檔：未研發
 * - 第 1 檔：研發完成（原本的行為）
 * - 第 2 檔：研發完成 **且** 旗下的地塊有足夠的土壤／水質條件
 *
 * 土壤與水質不新增欄位，而是由座標**決定性推導**（與地塊資源同樣做法）。
 * 這樣不必改 `Parcel` 結構、也不必動地形產生器與既有測試資料。
 */
export type QualityBand = 0 | 1 | 2;

/** 各檔的售價倍率。 */
export const QUALITY_PRICE_MUL_BY_BAND: Readonly<Record<QualityBand, number>> = {
  0: 1,
  1: 1.12,
  2: 1.28,
};

/** 各檔的生產週期拉伸（品質越高、做得越慢）。 */
export const QUALITY_CYCLE_STRETCH_BY_BAND: Readonly<Record<QualityBand, number>> = {
  0: 1,
  1: 1.08,
  2: 1.16,
};

/** 升到第 2 檔所需的土壤／水質綜合條件。 */
export const QUALITY_BAND_2_SUITABILITY = 0.7;

export interface ParcelSuitability {
  /** 0–1，土壤適合度 */
  readonly soil: number;
  /** 0–1，水質適合度 */
  readonly water: number;
  /** 0–1，兩者平均 */
  readonly overall: number;
}

/** 字串 → 32 位元雜湊（FNV-1a）。決定性、無狀態。 */
function hashText(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** 由座標推導土壤與水質適合度（0–1）。 */
export function parcelSuitability(parcel: Pick<Parcel, 'x' | 'y'>): ParcelSuitability {
  const key = `${parcel.x}:${parcel.y}`;
  const soil = (hashText(`soil#${key}`) % 1000) / 999;
  const water = (hashText(`water#${key}`) % 1000) / 999;
  return { soil, water, overall: (soil + water) / 2 };
}

/** 該地塊是否夠格做第 2 檔品質。 */
export function parcelSupportsTopQuality(parcel: Pick<Parcel, 'x' | 'y'>): boolean {
  return parcelSuitability(parcel).overall >= QUALITY_BAND_2_SUITABILITY;
}

/**
 * 依研發完成度與旗下最佳地塊條件，算出新的品質檔位。
 *
 * 只升不降 —— 品質是累積能力，不該因為換地而退步。
 */
export function advanceQualityBand(args: {
  readonly current: QualityBand;
  readonly researched: boolean;
  readonly bestSuitability: number;
}): QualityBand {
  if (!args.researched) {
    return args.current;
  }
  const reachable: QualityBand = args.bestSuitability >= QUALITY_BAND_2_SUITABILITY ? 2 : 1;
  return reachable > args.current ? reachable : args.current;
}

/** 售價倍率。 */
export function qualityPriceMultiplier(band: QualityBand): number {
  return QUALITY_PRICE_MUL_BY_BAND[band] ?? 1;
}

/** 週期拉伸倍率。 */
export function qualityCycleStretch(band: QualityBand): number {
  return QUALITY_CYCLE_STRETCH_BY_BAND[band] ?? 1;
}
