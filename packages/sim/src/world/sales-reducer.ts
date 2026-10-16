import {
  addPnL,
  emptyPnL,
  evaluateScenario,
  executeSellToNpc,
  findOfferById,
  generateNpcBuyOffers,
} from '../sales/index.js';
import type { ParcelId } from '../types/map.js';
import { DEFAULT_WORLD_CONFIG, type WorldConfig } from './config.js';
import { findParcel, type Player, type WorldState } from './state.js';
import { applyTaxTickWithPnl } from './day-reducer.js';

const MAINTENANCE_PER_FACTORY = 250;

export function applySellToNpc(
  state: WorldState,
  offerId: string,
  quantity: number,
  shipFromParcelId: ParcelId,
): WorldState {
  const player = state.players[state.localPlayerId];
  const parcel = findParcel(state, shipFromParcelId);
  const offer = findOfferById(state.npcBuyOffers, offerId);
  if (!player || !parcel || !offer) {
    return state;
  }

  const stock = state.inventories[player.id] ?? {};
  const result = executeSellToNpc(offer, quantity, parcel, stock, player.id);
  if (!result.ok || !result.stock || result.netCash === undefined) {
    return state;
  }

  const pnl = addPnL(state.pnl[player.id] ?? emptyPnL(), {
    revenue: result.grossRevenue ?? 0,
    transportCost: result.transportCost ?? 0,
  });

  const nextPlayer: Player = {
    ...player,
    cash: player.cash + result.netCash,
  };

  return {
    ...state,
    players: { ...state.players, [player.id]: nextPlayer },
    inventories: { ...state.inventories, [player.id]: result.stock },
    pnl: { ...state.pnl, [player.id]: pnl },
    scenario: evaluateScenario(state.scenario, state.gameDay, pnl),
  };
}

export function applyAdvanceDay(state: WorldState, config: WorldConfig = DEFAULT_WORLD_CONFIG): WorldState {
  const next = applyTaxTickWithPnl(state, config);

  const playerId = next.localPlayerId;
  const player = next.players[playerId];
  let pnl = next.pnl[playerId] ?? emptyPnL();

  const factoryCount = Object.values(next.sites).filter((s) => s.phase === 'complete').length;
  const maintenance = factoryCount * MAINTENANCE_PER_FACTORY;
  let cash = player.cash;
  const paidMaintenance = Math.min(maintenance, cash);
  cash -= paidMaintenance;
  pnl = addPnL(pnl, { maintenance: paidMaintenance });

  const gameDay = next.gameDay + 1;
  const nextPlayer: Player = { ...player, cash };
  pnl = aggregateProductionIdleLoss(next, playerId, pnl);

  const scenario = evaluateScenario(next.scenario, gameDay, pnl);

  return {
    ...next,
    gameDay,
    players: { ...next.players, [playerId]: nextPlayer },
    pnl: { ...next.pnl, [playerId]: pnl },
    npcBuyOffers: generateNpcBuyOffers(gameDay),
    scenario,
  };
}

function aggregateProductionIdleLoss(
  state: WorldState,
  playerId: string,
  pnl: ReturnType<typeof emptyPnL>,
) {
  let idle = 0;
  for (const line of Object.values(state.productionLines)) {
    idle += line.totalIdleLossValue;
  }
  const prev = state.pnl[playerId]?.productionIdleLoss ?? 0;
  const delta = Math.max(0, idle - prev);
  if (delta === 0) {
    return pnl;
  }
  return addPnL(pnl, { productionIdleLoss: delta });
}
