export * from './types/index.js';
export * from './buildings/index.js';
export * from './production/index.js';
export * from './sales/index.js';
export * from './commerce/index.js';
export * from './bank/index.js';
export * from './world/index.js';
export {
  DEFAULT_ROSTER,
  DEFAULT_SIMULATION,
  DOMINANT_SHARE,
  FACTORY_BASE_YIELD,
  STRATEGY_LABEL,
  accrueOperatingProfit,
  aggregateReport,
  isBankrupt,
  measureMarket,
  quoteOperatingRevenue,
  resolveSimulationOptions,
  runDataReport,
  runSimulatedGames,
  timePlanningFactor,
} from './reports/index.js';
export type {
  DataReport,
  GameOutcome,
  GamePlayerOutcome,
  ProfitBucket,
  ProfitDistribution,
  ReportParameters,
  ResolvedSimulation,
  SimRosterEntry,
  SimulationOptions,
  StrategyId,
  StrategySummary,
} from './reports/index.js';

export const SIM_PACKAGE_VERSION = '0.4.0-sprint4';
