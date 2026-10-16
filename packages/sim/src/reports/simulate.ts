import { applyWorldAction } from '../world/reducer.js';
import { DEFAULT_WORLD_CONFIG } from '../world/config.js';
import { createInitialWorld } from '../world/create-world.js';
import { getPlayerHoldings, type Player, type WorldState } from '../world/state.js';
import {
  accrueOperatingProfit,
  aggregateReport,
  emptyLedger,
  isBankrupt,
  measureMarket,
  playerCapacity,
  type OperatingLedger,
} from './economy.js';
import { createRng, deriveGameSeed, shuffle } from './rng.js';
import { bidLimit, chooseBid, chooseBuilds, type StrategyContext } from './strategies.js';
import type {
  DataReport,
  GameOutcome,
  GamePlayerOutcome,
  ResolvedSimulation,
  SimRosterEntry,
  SimulationOptions,
} from './types.js';
import { STRATEGY_LABEL } from './types.js';

export const DEFAULT_ROSTER: readonly SimRosterEntry[] = [
  { id: 'bot-cluster', name: STRATEGY_LABEL.cluster, strategy: 'cluster' },
  { id: 'bot-assembly', name: STRATEGY_LABEL['rapid-assembly'], strategy: 'rapid-assembly' },
  { id: 'bot-speculator', name: STRATEGY_LABEL.speculator, strategy: 'speculator' },
  { id: 'bot-random', name: STRATEGY_LABEL.random, strategy: 'random' },
];

export const DEFAULT_SIMULATION: ResolvedSimulation = {
  gameCount: 24,
  seed: 20_261_016,
  horizon: 18,
  mapWidth: 6,
  mapHeight: 5,
  startingCash: 50_000,
  roster: DEFAULT_ROSTER,
};

export function resolveSimulationOptions(options: SimulationOptions = {}): ResolvedSimulation {
  const gameCount = options.gameCount ?? DEFAULT_SIMULATION.gameCount;
  const horizon = options.horizon ?? DEFAULT_SIMULATION.horizon;
  const mapWidth = options.mapWidth ?? DEFAULT_SIMULATION.mapWidth;
  const mapHeight = options.mapHeight ?? DEFAULT_SIMULATION.mapHeight;
  const startingCash = options.startingCash ?? DEFAULT_SIMULATION.startingCash;
  const seed = options.seed ?? DEFAULT_SIMULATION.seed;
  const roster = options.roster ?? DEFAULT_SIMULATION.roster;

  if (!Number.isInteger(gameCount) || gameCount < 1) {
    throw new Error('局數必須為正整數');
  }
  if (!Number.isInteger(horizon) || horizon < 1) {
    throw new Error('週期數必須為正整數');
  }
  if (
    !Number.isInteger(mapWidth) ||
    !Number.isInteger(mapHeight) ||
    mapWidth < 2 ||
    mapHeight < 2
  ) {
    throw new Error('地圖至少為 2×2');
  }
  if (!Number.isFinite(startingCash) || startingCash < 0) {
    throw new Error('起始現金不可為負');
  }
  if (!Number.isFinite(seed)) {
    throw new Error('種子必須為有限數字');
  }
  if (roster.length === 0) {
    throw new Error('模擬名冊不可為空');
  }
  const ids = new Set(roster.map((bot) => bot.id));
  if (ids.size !== roster.length) {
    throw new Error('玩家編號不可重複');
  }

  return {
    gameCount,
    seed,
    horizon,
    mapWidth,
    mapHeight,
    startingCash,
    roster,
  };
}

export function runSimulatedGames(options: SimulationOptions = {}): GameOutcome[] {
  const resolved = resolveSimulationOptions(options);
  const games: GameOutcome[] = [];
  for (let index = 0; index < resolved.gameCount; index += 1) {
    games.push(runSingleGame(resolved, deriveGameSeed(resolved.seed, index)));
  }
  return games;
}

export function runDataReport(options: SimulationOptions = {}): DataReport {
  const resolved = resolveSimulationOptions(options);
  const games = runSimulatedGames(resolved);
  return aggregateReport(games, {
    seed: resolved.seed,
    horizon: resolved.horizon,
    mapWidth: resolved.mapWidth,
    mapHeight: resolved.mapHeight,
    startingCash: resolved.startingCash,
  });
}

function runSingleGame(config: ResolvedSimulation, seed: number): GameOutcome {
  const rng = createRng(seed);
  let state = createMatchState(config);
  let ledger = emptyLedger();

  for (let tick = 0; tick < config.horizon; tick += 1) {
    const order = shuffle(config.roster, rng);
    for (const bot of order) {
      state = applyBotBids(state, bot, rng);
    }
    state = settleAffordable(state);
    for (const bot of order) {
      state = applyBotBuilds(state, bot, rng);
    }
    state = applyWorldAction(state, { type: 'ADVANCE_BUILD_TICK' });
    const accrued = accrueOperatingProfit(state, ledger, config.horizon);
    state = accrued.state;
    ledger = accrued.ledger;
    state = applyWorldAction(state, { type: 'ADVANCE_TAX_TICK' });
  }

  return summarizeGame(state, ledger, config, seed);
}

function createMatchState(config: ResolvedSimulation): WorldState {
  const [first, ...rest] = config.roster;
  if (!first) {
    throw new Error('模擬名冊不可為空');
  }
  const base = createInitialWorld({
    mapWidth: config.mapWidth,
    mapHeight: config.mapHeight,
    startingCash: config.startingCash,
    playerId: first.id,
    playerName: first.name,
  });
  const players: Record<string, Player> = { ...base.players };
  for (const bot of rest) {
    players[bot.id] = { id: bot.id, name: bot.name, cash: config.startingCash };
  }
  return { ...base, players };
}

function strategyContext(
  state: WorldState,
  bot: SimRosterEntry,
  rng: ReturnType<typeof createRng>,
): StrategyContext {
  return {
    state,
    playerId: bot.id,
    rng,
    landTaxPerTick: DEFAULT_WORLD_CONFIG.landTaxPerTick,
  };
}

function applyBotBids(
  state: WorldState,
  bot: SimRosterEntry,
  rng: ReturnType<typeof createRng>,
): WorldState {
  let next = state;
  const limit = bidLimit(bot.strategy);
  for (let attempt = 0; attempt < limit; attempt += 1) {
    const action = chooseBid(bot.strategy, strategyContext(next, bot, rng));
    if (!action) {
      break;
    }
    const updated = applyWorldAction({ ...next, localPlayerId: bot.id }, action);
    if (updated === next) {
      break;
    }
    next = updated;
  }
  return next;
}

function applyBotBuilds(
  state: WorldState,
  bot: SimRosterEntry,
  rng: ReturnType<typeof createRng>,
): WorldState {
  let next = state;
  const actions = chooseBuilds(bot.strategy, strategyContext(next, bot, rng));
  for (const action of actions) {
    const updated = applyWorldAction({ ...next, localPlayerId: bot.id }, action);
    if (updated === next) {
      break;
    }
    next = updated;
  }
  return next;
}

function settleAffordable(state: WorldState): WorldState {
  const ranked = state.auctionLots
    .filter((lot) => lot.status === 'open' && lot.highBidderId !== null)
    .sort((a, b) => a.highBid - b.highBid || a.parcelId.value.localeCompare(b.parcelId.value));

  let next = state;
  for (const lot of ranked) {
    const bidderId = lot.highBidderId;
    if (!bidderId) {
      continue;
    }
    const bidder = next.players[bidderId];
    const current = next.auctionLots.find((item) => item.id === lot.id);
    if (!bidder || !current || current.status !== 'open' || current.highBidderId !== bidderId) {
      continue;
    }
    if (bidder.cash < current.highBid) {
      continue;
    }
    next = applyWorldAction(next, { type: 'SETTLE_AUCTION', parcelId: current.parcelId });
  }
  return next;
}

function summarizeGame(
  state: WorldState,
  ledger: OperatingLedger,
  config: ResolvedSimulation,
  seed: number,
): GameOutcome {
  const players: GamePlayerOutcome[] = config.roster.map((bot) => {
    const player = state.players[bot.id];
    const endingCash = player?.cash ?? 0;
    const ownedParcels = getPlayerHoldings(state, bot.id).length;
    const completeFactories = Object.values(state.sites).filter(
      (site) => site.phase === 'complete' && site.ownerId === bot.id,
    ).length;
    return {
      playerId: bot.id,
      name: bot.name,
      strategy: bot.strategy,
      startingCash: config.startingCash,
      endingCash,
      netProfit: endingCash - config.startingCash,
      bankrupt: isBankrupt(endingCash, completeFactories),
      ownedParcels,
      completeFactories,
      capacity: playerCapacity(state, bot.id),
      revenue: ledger.revenueByPlayer[bot.id] ?? 0,
    };
  });

  const market = measureMarket(players);
  return {
    seed,
    players,
    monopolyShare: market.share,
    herfindahl: market.herfindahl,
  };
}
