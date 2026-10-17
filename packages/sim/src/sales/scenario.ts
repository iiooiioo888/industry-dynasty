import { netProfit, type PnLSummary } from './pnl.js';
import { BALANCE } from '../balance/targets.js';

export interface ScenarioConfig {
  readonly targetNetProfit: number;
  readonly maxDays: number;
}

export const DEFAULT_SCENARIO: ScenarioConfig = {
  targetNetProfit: BALANCE.targetNetProfit,
  maxDays: BALANCE.maxDays,
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
): ScenarioState {
  if (scenario.status !== 'playing') {
    return scenario;
  }
  const profit = netProfit(pnl);
  if (profit >= scenario.config.targetNetProfit) {
    return { ...scenario, status: 'won' };
  }
  if (gameDay >= scenario.config.maxDays) {
    return { ...scenario, status: 'lost' };
  }
  return scenario;
}
