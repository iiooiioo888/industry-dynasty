import { netProfit, type PnLSummary } from './pnl.js';
import { BALANCE } from '../balance/targets.js';

/**
 * 關卡通關條件。
 *
 * ## 為什麼是兩個維度
 *
 * 原型《創業王》的關卡目標是多維度的（`Stages.csv` 的 22 關同時要求
 * 年獲利／資產／現金／清償貸款），而不是單一數字。單一淨利門檻的結果是：
 * 「買一塊地、蓋一座礦場、挖礦轉賣」就能過關（實測只贏門檻 0.8%），
 * 整條加工鏈可以跳過。
 *
 * 這裡的兩個維度刻意**不可互相替代**：
 * - `targetNetProfit`：財務成果（賺得到錢）
 * - `targetCraftedValue`：工業化程度（把原料變成產品）
 *
 * 純開採的加工產值恆為 0，所以無論賺多少都無法通關；
 * 反過來只加工不賺錢也一樣不行。
 */
export interface ScenarioConfig {
  readonly targetNetProfit: number;
  /** 累計加工產值門檻（非原料產出的帳面價值） */
  readonly targetCraftedValue: number;
  readonly maxDays: number;
}

export const DEFAULT_SCENARIO: ScenarioConfig = {
  targetNetProfit: BALANCE.targetNetProfit,
  targetCraftedValue: BALANCE.targetCraftedValue,
  maxDays: BALANCE.maxDays,
};

export type ScenarioStatus = 'playing' | 'won' | 'lost';

export interface ScenarioState {
  readonly config: ScenarioConfig;
  readonly status: ScenarioStatus;
}

/**
 * 舊存檔／舊狀態可能沒有 `targetCraftedValue`（這個欄位較晚加入）。
 * 缺省時退回現行設計值，避免舊存檔一開局就被判定無法通關。
 */
export function resolveScenarioConfig(config: Partial<ScenarioConfig>): ScenarioConfig {
  return {
    targetNetProfit: config.targetNetProfit ?? BALANCE.targetNetProfit,
    targetCraftedValue: config.targetCraftedValue ?? BALANCE.targetCraftedValue,
    maxDays: config.maxDays ?? BALANCE.maxDays,
  };
}

export function createScenarioState(config: ScenarioConfig = DEFAULT_SCENARIO): ScenarioState {
  return { config: resolveScenarioConfig(config), status: 'playing' };
}

/** 通關進度，供 UI 同時顯示兩個目標。 */
export interface ScenarioProgress {
  readonly netProfit: number;
  readonly craftedValue: number;
  readonly profitMet: boolean;
  readonly craftedMet: boolean;
}

export function scenarioProgress(
  scenario: ScenarioState,
  pnl: PnLSummary,
  craftedValue: number,
): ScenarioProgress {
  const config = resolveScenarioConfig(scenario.config);
  const profit = netProfit(pnl);
  return {
    netProfit: profit,
    craftedValue,
    profitMet: profit >= config.targetNetProfit,
    craftedMet: craftedValue >= config.targetCraftedValue,
  };
}

/**
 * 判定通關：**兩個目標都必須達成**。
 *
 * `craftedValue` 是該玩家累計加工產值（見 `production/chain.ts`）。
 * 呼叫端必須傳入，否則無法判斷工業化維度。
 */
export function evaluateScenario(
  scenario: ScenarioState,
  gameDay: number,
  pnl: PnLSummary,
  craftedValue: number,
): ScenarioState {
  if (scenario.status !== 'playing') {
    return scenario;
  }
  const progress = scenarioProgress(scenario, pnl, craftedValue);
  if (progress.profitMet && progress.craftedMet) {
    return { ...scenario, status: 'won' };
  }
  if (gameDay >= resolveScenarioConfig(scenario.config).maxDays) {
    return { ...scenario, status: 'lost' };
  }
  return scenario;
}
