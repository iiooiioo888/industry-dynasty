/** 模擬機器人策略。規則型負責聚落／趕工／圈地，隨機型提供對照。 */
export type StrategyId = 'cluster' | 'rapid-assembly' | 'speculator' | 'random';

export const STRATEGY_LABEL: Record<StrategyId, string> = {
  cluster: '聚落工坊',
  'rapid-assembly': '趕工組裝',
  speculator: '圈地投機',
  random: '隨機業者',
};

export interface SimRosterEntry {
  readonly id: string;
  readonly name: string;
  readonly strategy: StrategyId;
}

export interface SimulationOptions {
  readonly gameCount?: number;
  readonly seed?: number;
  readonly horizon?: number;
  readonly mapWidth?: number;
  readonly mapHeight?: number;
  readonly startingCash?: number;
  readonly roster?: readonly SimRosterEntry[];
}

export interface ResolvedSimulation {
  readonly gameCount: number;
  readonly seed: number;
  readonly horizon: number;
  readonly mapWidth: number;
  readonly mapHeight: number;
  readonly startingCash: number;
  readonly roster: readonly SimRosterEntry[];
}

export interface GamePlayerOutcome {
  readonly playerId: string;
  readonly name: string;
  readonly strategy: StrategyId;
  readonly startingCash: number;
  readonly endingCash: number;
  readonly netProfit: number;
  readonly bankrupt: boolean;
  readonly ownedParcels: number;
  readonly completeFactories: number;
  readonly capacity: number;
  readonly revenue: number;
}

export interface GameOutcome {
  readonly seed: number;
  readonly players: readonly GamePlayerOutcome[];
  /** 該局最大產能（或土地）份額，1 = 完全壟斷 */
  readonly monopolyShare: number;
  readonly herfindahl: number;
}

export interface ProfitBucket {
  readonly label: string;
  readonly min: number;
  readonly max: number;
  readonly count: number;
}

export interface ProfitDistribution {
  readonly sampleCount: number;
  readonly min: number;
  readonly p25: number;
  readonly median: number;
  readonly p75: number;
  readonly max: number;
  readonly mean: number;
  readonly buckets: readonly ProfitBucket[];
}

export interface StrategySummary {
  readonly strategy: StrategyId;
  readonly label: string;
  readonly observations: number;
  readonly bankruptcyRate: number;
  readonly meanNetProfit: number;
}

export interface ReportParameters {
  readonly mapWidth: number;
  readonly mapHeight: number;
  readonly horizon: number;
  readonly startingCash: number;
  readonly rosterSize: number;
}

export interface DataReport {
  readonly gameCount: number;
  readonly observations: number;
  readonly seed: number;
  readonly horizon: number;
  readonly parameters: ReportParameters;
  readonly bankruptcyRate: number;
  readonly bankruptCount: number;
  readonly netProfit: {
    readonly mean: number;
    readonly distribution: ProfitDistribution;
  };
  readonly monopoly: {
    /** 各局最大份額的平均。1 = 每一局都由單一玩家掌握全部產能。 */
    readonly tendency: number;
    readonly meanHerfindahl: number;
    /** 最大份額達一半以上的局數占比 */
    readonly dominantGameRate: number;
  };
  readonly strategies: readonly StrategySummary[];
}
