import { netProfit, type PnLSummary } from './pnl.js';
import { BALANCE } from '../balance/targets.js';
import { SHARE_MIN_REVENUE, SHARE_TARGET } from '../commerce/logic.js';

/**
 * 關卡通關條件。
 *
 * ## 為什麼是「路線」而不是單一數字
 *
 * 原型《創業王》的關卡目標是多維度的（`Stages.csv` 的 22 關同時要求
 * 年獲利／資產／現金／清償貸款），而不是單一數字。單一淨利門檻的結果是：
 * 「買一塊地、蓋一座礦場、挖礦轉賣」就能過關，整條加工鏈可以跳過。
 *
 * ## 兩條互斥的勝利路線
 *
 * 1. **工業化**：淨利達標 **且** 累計加工產值達標。
 *    純開採的加工產值恆為 0，所以無論挖多少礦都走不通 ——
 *    這是「必須真的把原料變成產品」的保證。
 * 2. **商業**：消費品銷售額達到城市需求的佔比門檻 **且** 營收達最低額。
 *    這條路線要求真的開門市、掌握通路，而不是靠賣原料。
 *
 * 兩條都不能只靠挖礦達成，所以「純開採」在任何組合下都無法通關。
 */
export interface ScenarioConfig {
  readonly targetNetProfit: number;
  /** 累計加工產值門檻（非原料產出的帳面價值） */
  readonly targetCraftedValue: number;
  readonly maxDays: number;
  /** 消費品銷售額佔城市需求的比例。 */
  readonly targetShare?: number;
  readonly minConsumerRevenue?: number;
  /** 累計清償貸款門檻 */
  readonly targetDebtRepaid: number;
}

export const DEFAULT_SCENARIO: ScenarioConfig = {
  targetNetProfit: BALANCE.targetNetProfit,
  targetCraftedValue: BALANCE.targetCraftedValue,
  maxDays: BALANCE.maxDays,
  targetShare: SHARE_TARGET,
  minConsumerRevenue: SHARE_MIN_REVENUE,
  targetDebtRepaid: BALANCE.targetDebtRepaid,
};

export type ScenarioStatus = 'playing' | 'won' | 'lost';

export interface ScenarioState {
  readonly config: ScenarioConfig;
  readonly status: ScenarioStatus;
}

/**
 * 舊存檔／舊狀態可能缺少較晚加入的欄位。
 * 缺省時退回現行設計值，避免舊存檔一開局就被判定無法通關。
 */
export function resolveScenarioConfig(config: Partial<ScenarioConfig>): ScenarioConfig {
  return {
    targetNetProfit: config.targetNetProfit ?? BALANCE.targetNetProfit,
    targetCraftedValue: config.targetCraftedValue ?? BALANCE.targetCraftedValue,
    maxDays: config.maxDays ?? BALANCE.maxDays,
    targetShare: config.targetShare ?? SHARE_TARGET,
    minConsumerRevenue: config.minConsumerRevenue ?? SHARE_MIN_REVENUE,
    targetDebtRepaid: config.targetDebtRepaid ?? BALANCE.targetDebtRepaid,
  };
}

export function createScenarioState(config: ScenarioConfig = DEFAULT_SCENARIO): ScenarioState {
  return { config: resolveScenarioConfig(config), status: 'playing' };
}

/** 商業路線的當期數據。 */
export interface CommerceSnapshot {
  readonly share: number;
  readonly consumerRevenue: number;
}

/**
 * 判定通關所需的額外資訊。
 *
 * 用單一物件而不是位置參數，因為各條路線需要不同的資料，
 * 而且日後再加維度時不會一直改簽名。
 */
export interface WinContext {
  /** 累計加工產值（工業化路線） */
  readonly craftedValue?: number;
  /** 城市需求佔比與消費營收（商業路線） */
  readonly commerce?: CommerceSnapshot;
  /** 累計清償貸款金額（還款路線） */
  readonly debtRepaid?: number;
  /** 目前仍未清償的負債總額（本金＋欠款） */
  readonly outstandingDebt?: number;
}

/** 通關進度，供 UI 顯示各條路線各自差多少。 */
export interface ScenarioProgress {
  readonly netProfit: number;
  readonly craftedValue: number;
  readonly commerce: CommerceSnapshot;
  readonly debtRepaid: number;
  readonly outstandingDebt: number;
  /** 工業化路線的兩個條件 */
  readonly profitMet: boolean;
  readonly craftedMet: boolean;
  /** 商業路線的兩個條件 */
  readonly minRevenueMet: boolean;
  readonly shareMet: boolean;
  /** 還款路線的三個條件 */
  readonly repaidMet: boolean;
  readonly debtClear: boolean;
  /** 任一整條路線達成 */
  readonly won: boolean;
}

export function scenarioProgress(
  scenario: ScenarioState,
  pnl: PnLSummary,
  context: WinContext = {},
): ScenarioProgress {
  const config = resolveScenarioConfig(scenario.config);
  const profit = netProfit(pnl);
  const crafted = context.craftedValue ?? 0;
  const commerce: CommerceSnapshot = context.commerce ?? { share: 0, consumerRevenue: 0 };
  const debtRepaid = context.debtRepaid ?? 0;
  const outstandingDebt = context.outstandingDebt ?? 0;

  const profitMet = profit >= config.targetNetProfit;
  const craftedMet = crafted >= config.targetCraftedValue;
  const minRevenueMet =
    commerce.consumerRevenue >= (config.minConsumerRevenue ?? SHARE_MIN_REVENUE);
  const shareMet = commerce.share >= (config.targetShare ?? SHARE_TARGET);
  const repaidMet = debtRepaid >= config.targetDebtRepaid;
  const debtClear = outstandingDebt <= 0;

  return {
    netProfit: profit,
    craftedValue: crafted,
    commerce,
    debtRepaid,
    outstandingDebt,
    profitMet,
    craftedMet,
    minRevenueMet,
    shareMet,
    repaidMet,
    debtClear,
    won:
      (profitMet && craftedMet) ||
      (minRevenueMet && shareMet) ||
      // 還款路線也必須獲利 —— 否則「借一筆立刻還掉」就能刷滿累計清償
      (profitMet && repaidMet && debtClear),
  };
}

/**
 * 判定通關。
 *
 * 三條路線取聯集：
 * - 工業化：淨利 ＋ 加工產值
 * - 商業：消費營收 ＋ 城市需求佔比
 * - 還款：淨利 ＋ 累計清償 ＋ 期末零負債
 */
export function evaluateScenario(
  scenario: ScenarioState,
  gameDay: number,
  pnl: PnLSummary,
  context: WinContext = {},
): ScenarioState {
  if (scenario.status !== 'playing') {
    return scenario;
  }
  if (scenarioProgress(scenario, pnl, context).won) {
    return { ...scenario, status: 'won' };
  }
  if (gameDay >= resolveScenarioConfig(scenario.config).maxDays) {
    return { ...scenario, status: 'lost' };
  }
  return scenario;
}
