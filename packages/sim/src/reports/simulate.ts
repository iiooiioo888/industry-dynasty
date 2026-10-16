import { applyWorldAction } from '../world/reducer.js';
import { DEFAULT_WORLD_CONFIG } from '../world/config.js';
import { createInitialWorld } from '../world/create-world.js';
import { getPlayerHoldings, type Player, type WorldState } from '../world/state.js';
import { ITEMS, getItemQty } from '../production/items.js';
import { runProductionPlan } from '../production/planning.js';
import { emptyPnL, netProfit } from '../sales/pnl.js';
import { quoteSale } from '../sales/sell-logic.js';
import { DEFAULT_SCENARIO } from '../sales/scenario.js';
import { quoteLandSale } from '../world/land-sale.js';
import { aggregateReport, isBankrupt, measureMarket, playerCapacity } from './economy.js';
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

/**
 * 模擬器的預設參數，**對齊實際出貨情境**。
 *
 * 先前預設是 6×5 / horizon 18 / $50,000，與玩家真正玩到的
 * 16×12 / 25 天 / $100,000 不同，因此 `DataReport` 描述的是另一個局面，
 * 不能用來回答「玩家能不能過關」。改為直接讀出貨常數，兩者不會再漂移。
 */
export const DEFAULT_SIMULATION: ResolvedSimulation = {
  gameCount: 24,
  seed: 20_261_016,
  horizon: DEFAULT_SCENARIO.maxDays,
  mapWidth: DEFAULT_WORLD_CONFIG.mapWidth,
  mapHeight: DEFAULT_WORLD_CONFIG.mapHeight,
  startingCash: DEFAULT_WORLD_CONFIG.startingCash,
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
    games.push(runSingleGame(resolved, deriveGameSeed(resolved.seed, index), options));
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

function runSingleGame(
  config: ResolvedSimulation,
  seed: number,
  options?: SimulationOptions,
): GameOutcome {
  const rng = createRng(seed);
  let state = createMatchState(config);
  // 每個機器人各持有「土地取得成本」，供圈地投機判斷何時出場
  const acquiredAt = new Map<string, Map<string, number>>();
  for (const bot of config.roster) {
    acquiredAt.set(bot.id, new Map());
  }

  for (let tick = 0; tick < config.horizon; tick += 1) {
    const order = shuffle(config.roster, rng);
    for (const bot of order) {
      state = applyBotBids(state, bot, rng);
    }

    // 記錄取得成本。注意**不能用「現金減少量」**：得標時會一併清償該地塊的
    // 欠稅（`applySettle` 會把 `unpaidLandTax` 歸零），所以現金差額
    // ＝ 標金 ＋ 前手欠稅，會遠高於實際地價。
    // 先前就是這樣讓投機者的成本基準被灌水（買價 1,368 卻記成 5,712），
    // 於是「轉手價 > 成本」永遠不成立、永遠等不到出場。
    // 這裡改記「標金 ＋ 承接的欠稅」，才是真正的持有成本。
    const bidsBefore = new Map<string, Map<string, { bid: number; tax: number }>>();
    for (const lot of state.auctionLots) {
      if (lot.status !== 'open' || !lot.highBidderId) {
        continue;
      }
      const book = bidsBefore.get(lot.highBidderId) ?? new Map();
      book.set(lot.parcelId.value, {
        bid: lot.highBid,
        tax: state.unpaidLandTax[lot.parcelId.value] ?? 0,
      });
      bidsBefore.set(lot.highBidderId, book);
    }

    state = settleAffordable(state);
    for (const bot of config.roster) {
      const book = acquiredAt.get(bot.id)!;
      const won = bidsBefore.get(bot.id);
      if (!won) {
        continue;
      }
      for (const parcel of getPlayerHoldings(state, bot.id)) {
        const entry = won.get(parcel.id.value);
        if (entry && !book.has(parcel.id.value)) {
          book.set(parcel.id.value, entry.bid + entry.tax);
        }
      }
    }

    for (const bot of order) {
      state = applyBotBuilds(state, bot, rng);
    }
    state = applyWorldAction(state, { type: 'ADVANCE_BUILD_TICK' });

    // 走**真實生產鏈**：為每座完工工廠排配方、推進生產、把成品賣給 NPC。
    // 舊版用 `accrueOperatingProfit` 的簡化收益模型
    // （FACTORY_BASE_YIELD × 物流係數 × 時間規劃），完全不經過配方、庫存與運費，
    // 因此量到的策略排名與實際玩法無關。
    for (const bot of order) {
      state = applyBotProduction(state, bot);
    }
    state = applyWorldAction(state, { type: 'ADVANCE_PRODUCTION_TICK' });
    for (const bot of order) {
      state = applyBotSales(state, bot);
    }
    // 已經增值的土地換回現金（圈地投機的出口）
    for (const bot of order) {
      state = applyBotLandSales(state, bot, acquiredAt.get(bot.id)!);
    }

    // 結束本日：土地稅、維護、NPC 報價刷新、通關判定，並讓 gameDay 前進。
    //
    // 這裡原本用 `ADVANCE_TAX_TICK`，但那個動作只收稅與結算財務，
    // **不會讓 `gameDay` 前進**（只有 `ADVANCE_DAY` 會）。
    // 結果模擬器的時間是凍結的：地價增值、NPC 報價、維護費與
    // `evaluateScenario` 全部停在第一天 —— 圈地投機因此永遠等不到增值。
    state = applyWorldAction(state, { type: 'ADVANCE_DAY' });
    options?.inspect?.(tick, state);
  }

  return summarizeGame(state, config, seed);
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

/**
 * 圈地投機的出口：把已經增值的土地轉手換回現金。
 *
 * 沒有這一步時，投機者買到的地只會一直繳稅，永遠無法變現 ——
 * 它就只能當量尺（floor），不是可玩策略。
 *
 * 判斷方式：以「當期估價 × 轉手折價」對上取得成本，
 * 只要轉手能拿回的比當初付出的多就出場。
 * 取得成本取自 `acquiredAt`（買進當天的估價），因此持有越久、
 * 地價複利成長越多的地塊會越早被賣掉 —— 與 `landBreakEvenDays()` 的手感一致。
 */
function applyBotLandSales(
  state: WorldState,
  bot: SimRosterEntry,
  acquiredAt: Map<string, number>,
): WorldState {
  let next = { ...state, localPlayerId: bot.id };
  for (const parcel of getPlayerHoldings(next, bot.id)) {
    const key = parcel.id.value;
    // 地上有建築時不能轉手，必須先拆除
    if (next.sites[key]) {
      continue;
    }
    const cost = acquiredAt.get(key);
    if (cost === undefined) {
      continue;
    }
    const quote = quoteLandSale(parcel, bot.id, DEFAULT_WORLD_CONFIG, next.gameDay, false);
    if (!quote.ok || quote.proceeds <= cost) {
      continue;
    }
    next = applyWorldAction(next, { type: 'SELL_LAND', parcelId: parcel.id });
    acquiredAt.delete(key);
  }
  return { ...next, localPlayerId: state.localPlayerId };
}

/**
 * 為這名玩家的完工工廠排出生產計畫。
 *
 * 走 `production/planning.ts` 的共用規則（與 `reports/full-loop.ts` 同一套），
 * 所以機器人**會加工**而不只是開採。先前這裡是「一律挑該礦脈的開採配方」，
 * 因此策略排名只反映「誰挖得多」，不反映「誰經營得好」。
 *
 * 深度固定為 1（允許一階加工）：機器人沒有跨廠的供應鏈規劃能力，
 * 只做「開採 → 一階加工」這種同廠可完成的鏈路。
 * 礦場與加工廠數量約各半，確保加工廠拿得到原料。
 */
function applyBotProduction(state: WorldState, bot: SimRosterEntry): WorldState {
  const playerId = bot.id;
  const factoryKeys = Object.entries(state.sites)
    .filter(([, site]) => site.phase === 'complete' && site.ownerId === playerId)
    .map(([key]) => key);
  if (factoryKeys.length === 0) {
    return state;
  }
  const extractorCount = Math.max(1, Math.floor(factoryKeys.length / 2));
  return runProductionPlan(
    { ...state, localPlayerId: playerId },
    playerId,
    factoryKeys,
    1,
    extractorCount,
  );
}

/** 把這名玩家庫存裡的可販售品項賣給當日報價最佳的 NPC。 */
function applyBotSales(state: WorldState, bot: SimRosterEntry): WorldState {
  let next = { ...state, localPlayerId: bot.id };
  const holdings = getPlayerHoldings(next, bot.id);
  const shipFrom = holdings[0];
  if (!shipFrom) {
    return { ...next, localPlayerId: state.localPlayerId };
  }
  for (const item of Object.values(ITEMS)) {
    if (!item.sellable) {
      continue;
    }
    const offers = next.npcBuyOffers.filter((o) => o.itemId === item.id);
    if (offers.length === 0) {
      continue;
    }
    const best = offers
      .map((o) => ({ offer: o, quote: quoteSale(o, shipFrom) }))
      .sort((a, b) => b.quote.netPerUnit - a.quote.netPerUnit)[0];
    if (!best || best.quote.netPerUnit <= 0) {
      continue;
    }
    const qty = Math.min(
      getItemQty(next.inventories[bot.id] ?? {}, item.id),
      best.offer.maxQuantity,
    );
    if (qty <= 0) {
      continue;
    }
    next = applyWorldAction(next, {
      type: 'SELL_TO_NPC',
      offerId: best.offer.id,
      quantity: qty,
      shipFromParcelId: shipFrom.id,
    });
  }
  return { ...next, localPlayerId: state.localPlayerId };
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

function summarizeGame(state: WorldState, config: ResolvedSimulation, seed: number): GameOutcome {
  const players: GamePlayerOutcome[] = config.roster.map((bot) => {
    const player = state.players[bot.id];
    const endingCash = player?.cash ?? 0;
    const ownedParcels = getPlayerHoldings(state, bot.id).length;
    const completeFactories = Object.values(state.sites).filter(
      (site) => site.phase === 'complete' && site.ownerId === bot.id,
    ).length;
    // 淨利改用真實 PnL（營收 − 稅 − 維護 − 運費 − 拍賣 − 建廠 − 閒置），
    // 這是 `evaluateScenario` 判定通關所用的同一個數字。
    const pnl = state.pnl[bot.id] ?? emptyPnL();
    const profit = netProfit(pnl);
    return {
      playerId: bot.id,
      name: bot.name,
      strategy: bot.strategy,
      startingCash: config.startingCash,
      endingCash,
      netProfit: profit,
      // 通關判定與實際遊戲一致：horizon 結束時淨利是否達到門檻
      won: profit >= DEFAULT_SCENARIO.targetNetProfit,
      bankrupt: isBankrupt(endingCash, completeFactories),
      ownedParcels,
      completeFactories,
      capacity: playerCapacity(state, bot.id),
      revenue: pnl.revenue,
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
