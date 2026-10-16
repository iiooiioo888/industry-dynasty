export {
  DOMINANT_SHARE,
  FACTORY_BASE_YIELD,
  TIME_PLANNING_FLOOR,
  TIME_PLANNING_SPAN,
  accrueOperatingProfit,
  aggregateReport,
  buildHistogram,
  emptyLedger,
  isBankrupt,
  mean,
  measureMarket,
  percentile,
  playerCapacity,
  profitDistribution,
  quoteOperatingRevenue,
  timePlanningFactor,
} from './economy.js';
export type { MarketMeasure, MarketSlice, OperatingLedger, ReportMeta } from './economy.js';
export { createRng, deriveGameSeed } from './rng.js';
export {
  DEFAULT_ROSTER,
  DEFAULT_SIMULATION,
  resolveSimulationOptions,
  runDataReport,
  runSimulatedGames,
} from './simulate.js';
export { STRATEGY_LABEL } from './types.js';
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
} from './types.js';
