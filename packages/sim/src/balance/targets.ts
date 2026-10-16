/**
 * 平衡基準 · balance targets
 *
 * 這個檔案的目的：讓「遊戲是否可通關」變成**可計算、可測試**的事實，
 * 而不是靠手感調数字。
 *
 * 推導方式（以單座工坊為單位，1 tick ≈ 1 日）：
 *
 *   每座工廠每日淨貢獻 = 每日毛利 − (土地稅 + 維護)
 *   通關需要          = Σ(每座工廠每日淨貢獻 × 可營運天數) ≥ 通關門檻
 *
 * 量測基準（見 `reports/full-loop-measure.test.ts`）：
 * 修正前單座工坊最佳配方（開採鐵礦）每日毛利僅 50，
 * 而土地稅 500 + 維護 250 = 750/日 → 結構性虧損，任何策略都不可能通關。
 */
import type { FactoryTypeId } from '../buildings/catalog.js';

/** 通關設計目標：在 25 天內、以 6 座工廠達成。 */
export const BALANCE = {
  /**
   * 通關門檻（淨利）。
   *
   * 由產能反推：開採配方每日毛利約 285、加工配方約 200，
   * 扣掉每日持有成本 70 後分別為 215 / 130。
   * 6 座工廠、25 天、混合配置的毛利約 30,000～40,000，
   * 扣掉 6 座建廠成本 18,000 後約 12,000～22,000。
   * 門檻設在 12,000，因此**必須真的把礦煉成合金板**才過得了，
   * 純開採堆數量會卡在邊緣。
   */
  targetNetProfit: 12_000,
  /** 通關天數上限 */
  maxDays: 25,
  /** 設計上假設玩家能經營的工廠數 */
  designFactoryCount: 6,
  /** 建廠到開始回收的合理回本期（日） */
  paybackDays: 6,
  /** 每座工廠每日應產出的毛利目標（未扣持有成本） */
  targetGrossMarginPerDay: 250,
} as const;

/** 每座工廠的每日持有成本。 */
export const HOLDING = {
  /** 土地稅：每塊地每日 */
  landTaxPerParcelPerDay: 30,
  /** 工廠維護：每座每日 */
  maintenancePerFactoryPerDay: 40,
} as const;

/** 單座工廠每日持有成本 */
export function dailyHoldingCostPerFactory(): number {
  return HOLDING.landTaxPerParcelPerDay + HOLDING.maintenancePerFactoryPerDay;
}

/**
 * 在 `designFactoryCount` 座工廠、`maxDays` 天的前提下，
 * 達到 `targetNetProfit` 所需的每座工廠每日毛利。
 *
 * 注意分子不退還資本支出 —— 建廠費用在 PnL 內是費用，不回沖。
 */
export function requiredGrossMarginPerFactoryPerDay(
  buildCost: number,
  factoryCount: number = BALANCE.designFactoryCount,
  days: number = BALANCE.maxDays,
  target: number = BALANCE.targetNetProfit,
): number {
  const holdingPerFactory = dailyHoldingCostPerFactory() * days;
  const capitalPerFactory = buildCost;
  // 總成本 = 資本支出 + 持有成本；需要 (總成本 + 通關門檻) / (工廠數 × 天數)
  return (capitalPerFactory + holdingPerFactory + target / factoryCount) / days;
}

/** 檢查一組參數是否讓遊戲可通關，回傳實際可達成的淨利。 */
export function projectNetProfit(args: {
  readonly grossMarginPerFactoryPerDay: number;
  readonly buildCost: number;
  readonly factoryCount: number;
  readonly days: number;
}): number {
  const perFactory = args.grossMarginPerFactoryPerDay * args.days;
  const gross = perFactory * args.factoryCount;
  const costs = (args.buildCost + dailyHoldingCostPerFactory() * args.days) * args.factoryCount;
  return Math.round(gross - costs);
}

/** 各工廠類型的每日毛利目標倍率（組裝廠處理較高階配方）。 */
export const FACTORY_MARGIN_MULTIPLIER: Record<FactoryTypeId, number> = {
  workshop: 1,
  'assembly-plant': 1.8,
};
