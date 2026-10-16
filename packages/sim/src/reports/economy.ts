import { getSiteLogisticsView } from '../buildings/adjacency.js';
import { FACTORY_TYPES, type FactoryTypeId } from '../buildings/catalog.js';
import type { WorldState } from '../world/state.js';
import type {
  DataReport,
  GameOutcome,
  GamePlayerOutcome,
  ProfitBucket,
  ProfitDistribution,
  ReportParameters,
  StrategyId,
  StrategySummary,
} from './types.js';
import { STRATEGY_LABEL } from './types.js';

/**
 * 營運收入 = 基礎產出 × 空間效率 × 時間規劃。
 * 空間效率沿用完工工廠的物流係數（含四向相鄰加成）。
 * 時間規劃在建造期間為 0；完工後隨已運轉週期上升，上限 1.25。
 */
export const TIME_PLANNING_FLOOR = 0.55;
export const TIME_PLANNING_SPAN = 0.7;

export const FACTORY_BASE_YIELD: Record<FactoryTypeId, number> = {
  workshop: 3_200,
  'assembly-plant': 7_200,
};

/** 最大份額達此值視為該局出現主導者 */
export const DOMINANT_SHARE = 0.5;

const STRATEGY_ORDER: readonly StrategyId[] = ['cluster', 'rapid-assembly', 'speculator', 'random'];

const HISTOGRAM_BINS = 5;

export interface OperatingLedger {
  readonly revenueByPlayer: Readonly<Record<string, number>>;
  readonly operatingTicksByParcel: Readonly<Record<string, number>>;
}

export function emptyLedger(): OperatingLedger {
  return { revenueByPlayer: {}, operatingTicksByParcel: {} };
}

export function timePlanningFactor(
  operatingTicks: number,
  horizon: number,
  buildTimeTicks: number,
): number {
  if (operatingTicks <= 0) {
    return 0;
  }
  const window = Math.max(1, horizon - buildTimeTicks);
  const progress = Math.min(1, operatingTicks / window);
  return TIME_PLANNING_FLOOR + TIME_PLANNING_SPAN * progress;
}

export function quoteOperatingRevenue(
  baseYield: number,
  spatialEfficiency: number,
  operatingTicks: number,
  horizon: number,
  buildTimeTicks: number,
): number {
  const planned = timePlanningFactor(operatingTicks, horizon, buildTimeTicks);
  return Math.round(baseYield * spatialEfficiency * planned);
}

export function accrueOperatingProfit(
  state: WorldState,
  ledger: OperatingLedger,
  horizon: number,
): { state: WorldState; ledger: OperatingLedger } {
  const operatingTicksByParcel = { ...ledger.operatingTicksByParcel };
  const revenueByPlayer = { ...ledger.revenueByPlayer };
  let players = state.players;

  for (const [parcelKey, site] of Object.entries(state.sites)) {
    if (site.phase !== 'complete') {
      continue;
    }
    const parcel = state.map.parcels.find((item) => item.id.value === parcelKey);
    const owner = players[site.ownerId];
    if (!parcel || !owner) {
      continue;
    }

    const ticks = (operatingTicksByParcel[parcelKey] ?? 0) + 1;
    operatingTicksByParcel[parcelKey] = ticks;
    const spatial = getSiteLogisticsView(state.map, parcel, site, state.sites).factor;
    const factory = FACTORY_TYPES[site.factoryTypeId];
    const revenue = quoteOperatingRevenue(
      FACTORY_BASE_YIELD[site.factoryTypeId],
      spatial,
      ticks,
      horizon,
      factory.buildTimeTicks,
    );
    if (revenue === 0) {
      continue;
    }

    revenueByPlayer[owner.id] = (revenueByPlayer[owner.id] ?? 0) + revenue;
    players = {
      ...players,
      [owner.id]: { ...owner, cash: owner.cash + revenue },
    };
  }

  return {
    state: { ...state, players },
    ledger: { revenueByPlayer, operatingTicksByParcel },
  };
}

/** 期末現金耗盡且沒有完工工廠：無法再以空間效率覆蓋土地稅。 */
export function isBankrupt(endingCash: number, completeFactories: number): boolean {
  return endingCash <= 0 && completeFactories <= 0;
}

export interface MarketSlice {
  readonly capacity: number;
  readonly ownedParcels: number;
}

export interface MarketMeasure {
  readonly share: number;
  readonly herfindahl: number;
}

/**
 * 壟斷傾向以完工產能份額計算（基礎產出 × 物流效率）。
 * 若該局沒有任何完工工廠，改看持有土地份額。
 */
export function measureMarket(players: readonly MarketSlice[]): MarketMeasure {
  if (players.length === 0) {
    return { share: 0, herfindahl: 0 };
  }

  const totalCapacity = players.reduce((sum, player) => sum + player.capacity, 0);
  const totalLand = players.reduce((sum, player) => sum + player.ownedParcels, 0);
  const shares =
    totalCapacity > 0
      ? players.map((player) => player.capacity / totalCapacity)
      : totalLand > 0
        ? players.map((player) => player.ownedParcels / totalLand)
        : players.map(() => 0);

  const herfindahl = shares.reduce((sum, share) => sum + share * share, 0);
  const share = shares.reduce((max, value) => Math.max(max, value), 0);
  return { share, herfindahl };
}

export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) {
    return 0;
  }
  if (sorted.length === 1) {
    return sorted[0] ?? 0;
  }
  const index = (sorted.length - 1) * p;
  const low = Math.floor(index);
  const high = Math.ceil(index);
  const lower = sorted[low] ?? 0;
  const upper = sorted[high] ?? lower;
  if (low === high) {
    return lower;
  }
  const weight = index - low;
  return lower * (1 - weight) + upper * weight;
}

export function mean(values: readonly number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function buildHistogram(
  values: readonly number[],
  binCount = HISTOGRAM_BINS,
): ProfitBucket[] {
  if (values.length === 0) {
    return [];
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) {
    return [
      {
        label: formatBucketLabel(min, max),
        min,
        max,
        count: values.length,
      },
    ];
  }

  const width = (max - min) / binCount;
  const counts = Array.from({ length: binCount }, () => 0);
  for (const value of values) {
    let index = Math.floor((value - min) / width);
    if (index >= binCount) {
      index = binCount - 1;
    }
    counts[index] = (counts[index] ?? 0) + 1;
  }

  return counts.map((count, index) => {
    const lo = min + index * width;
    const hi = index === binCount - 1 ? max : min + (index + 1) * width;
    return {
      label: formatBucketLabel(lo, hi),
      min: lo,
      max: hi,
      count,
    };
  });
}

function formatBucketLabel(min: number, max: number): string {
  const left = Math.round(min).toLocaleString('zh-TW');
  const right = Math.round(max).toLocaleString('zh-TW');
  if (left === right) {
    return left;
  }
  return `${left} – ${right}`;
}

export function profitDistribution(values: readonly number[]): ProfitDistribution {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    sampleCount: sorted.length,
    min: sorted[0] ?? 0,
    p25: percentile(sorted, 0.25),
    median: percentile(sorted, 0.5),
    p75: percentile(sorted, 0.75),
    max: sorted[sorted.length - 1] ?? 0,
    mean: mean(sorted),
    buckets: buildHistogram(sorted),
  };
}

export interface ReportMeta {
  readonly seed: number;
  readonly horizon: number;
  readonly mapWidth: number;
  readonly mapHeight: number;
  readonly startingCash: number;
}

const EMPTY_META: ReportMeta = {
  seed: 0,
  horizon: 0,
  mapWidth: 0,
  mapHeight: 0,
  startingCash: 0,
};

export function aggregateReport(
  games: readonly GameOutcome[],
  meta: ReportMeta = EMPTY_META,
): DataReport {
  const players = games.flatMap((game) => [...game.players]);
  const profits = players.map((player) => player.netProfit);
  const distribution = profitDistribution(profits);
  const bankruptCount = players.filter((player) => player.bankrupt).length;
  const wonCount = players.filter((player) => player.won).length;
  const observations = players.length;
  const dominantGames = games.filter((game) => game.monopolyShare >= DOMINANT_SHARE).length;

  const parameters: ReportParameters = {
    mapWidth: meta.mapWidth,
    mapHeight: meta.mapHeight,
    horizon: meta.horizon,
    startingCash: meta.startingCash,
    rosterSize: games[0]?.players.length ?? 0,
  };

  return {
    gameCount: games.length,
    observations,
    seed: meta.seed,
    horizon: meta.horizon,
    parameters,
    bankruptcyRate: observations === 0 ? 0 : bankruptCount / observations,
    bankruptCount,
    // 勝率：與 `evaluateScenario` 同一判定（淨利達通關門檻）。
    // 這是「玩家能不能過關」在模擬器裡的答案，先前完全沒有量測。
    winRate: observations === 0 ? 0 : wonCount / observations,
    wonCount,
    netProfit: {
      mean: distribution.mean,
      distribution,
    },
    monopoly: {
      tendency: mean(games.map((game) => game.monopolyShare)),
      meanHerfindahl: mean(games.map((game) => game.herfindahl)),
      dominantGameRate: games.length === 0 ? 0 : dominantGames / games.length,
    },
    strategies: summarizeStrategies(players),
  };
}

function summarizeStrategies(players: readonly GamePlayerOutcome[]): StrategySummary[] {
  const grouped = new Map<StrategyId, GamePlayerOutcome[]>();
  for (const player of players) {
    const list = grouped.get(player.strategy) ?? [];
    list.push(player);
    grouped.set(player.strategy, list);
  }

  const ordered = [
    ...STRATEGY_ORDER.filter((strategy) => grouped.has(strategy)),
    ...[...grouped.keys()].filter((strategy) => !STRATEGY_ORDER.includes(strategy)),
  ];

  return ordered.map((strategy) => {
    const rows = grouped.get(strategy) ?? [];
    const bankrupt = rows.filter((row) => row.bankrupt).length;
    return {
      strategy,
      label: STRATEGY_LABEL[strategy],
      observations: rows.length,
      bankruptcyRate: rows.length === 0 ? 0 : bankrupt / rows.length,
      meanNetProfit: mean(rows.map((row) => row.netProfit)),
    };
  });
}

export function playerCapacity(state: WorldState, playerId: string): number {
  let capacity = 0;
  for (const [parcelKey, site] of Object.entries(state.sites)) {
    if (site.phase !== 'complete' || site.ownerId !== playerId) {
      continue;
    }
    const parcel = state.map.parcels.find((item) => item.id.value === parcelKey);
    if (!parcel) {
      continue;
    }
    const spatial = getSiteLogisticsView(state.map, parcel, site, state.sites).factor;
    capacity += FACTORY_BASE_YIELD[site.factoryTypeId] * spatial;
  }
  return capacity;
}
