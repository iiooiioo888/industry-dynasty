import { netProfit, type PnLSummary } from './pnl.js';
import { BALANCE } from '../balance/targets.js';
import { SHARE_MIN_REVENUE, SHARE_TARGET } from '../commerce/logic.js';

export interface ScenarioConfig {
  readonly targetNetProfit: number;
  readonly maxDays: number;
  /** 消費品銷售額佔城市需求的比例。 */
  readonly targetShare?: number;
  readonly minConsumerRevenue?: number;
}

export const DEFAULT_SCENARIO: ScenarioConfig = {
  targetNetProfit: BALANCE.targetNetProfit,
  maxDays: BALANCE.maxDays,
  targetShare: SHARE_TARGET,
  minConsumerRevenue: SHARE_MIN_REVENUE,
};

export type ScenarioStatus = 'playing' | 'won' | 'lost';

export interface ScenarioState {
  readonly config: ScenarioConfig;
  readonly status: ScenarioStatus;
}

export function createScenarioState(config: ScenarioConfig = DEFAULT_SCENARIO): ScenarioState {
  return { config, status: 'playing' };
}

export function evaluateScenario(
  scenario: ScenarioState,
  gameDay: number,
  pnl: PnLSummary,
  commerce?: { readonly share: number; readonly consumerRevenue: number },
): ScenarioState {
  if (scenario.status !== 'playing') {
    return scenario;
  }
  const profit = netProfit(pnl);
  const shareTarget = scenario.config.targetShare ?? SHARE_TARGET;
  const minRevenue = scenario.config.minConsumerRevenue ?? SHARE_MIN_REVENUE;
  const shareWon =
    (commerce?.consumerRevenue ?? 0) >= minRevenue && (commerce?.share ?? 0) >= shareTarget;
  if (profit >= scenario.config.targetNetProfit || shareWon) {
    return { ...scenario, status: 'won' };
  }
  if (gameDay >= scenario.config.maxDays) {
    return { ...scenario, status: 'lost' };
  }
  return scenario;
}
