import { FACTORY_TYPES } from '../buildings/catalog.js';
import { buildNpcDeals } from '../npc/deals.js';
import { expandNpcBlocks } from '../npc/expand.js';
import {
  applyCommerceDay,
  freightMultiplier,
  marketShareOf,
  rawPortMultiplier,
  readCommerce,
} from '../commerce/logic.js';
import { getItemQty, removeItem } from '../production/items.js';
import {
  addPnL,
  emptyPnL,
  evaluateScenario,
  executeSellToNpc,
  findOfferById,
  generateNpcBuyOffers,
} from '../sales/index.js';
import { TRANSPORT_RATE_PER_TILE } from '../sales/sell-logic.js';
import { HOLDING } from '../balance/targets.js';
import { debtOf, getPlayerBank } from '../bank/logic.js';
import { craftedValue } from '../production/chain.js';
import { MACHINE_GRADES } from '../production/machines.js';
import type { ParcelId } from '../types/map.js';
import { DEFAULT_WORLD_CONFIG, type WorldConfig } from './config.js';
import { findPath } from './pathfinding.js';
import { createShipment, listShipments } from './shipments.js';
import { findParcel, type Player, type WorldState } from './state.js';
import { applyTaxTickWithPnl } from './day-reducer.js';

export const MAINTENANCE_PER_FACTORY = HOLDING.maintenancePerFactoryPerDay;

export function applySellToNpc(
  state: WorldState,
  offerId: string,
  quantity: number,
  shipFromParcelId: ParcelId,
): WorldState {
  const player = state.players[state.localPlayerId];
  const offer = findOfferById(state.npcBuyOffers, offerId);
  if (!player || !offer) {
    return state;
  }

  const parcel = findParcel(state, shipFromParcelId);
  if (!parcel || parcel.ownerId !== player.id) {
    return state;
  }

  const stock = state.inventories[player.id] ?? {};
  const result = executeSellToNpc(offer, quantity, parcel, stock, player.id);
  if (
    !result.ok ||
    !result.stock ||
    result.netCash === undefined ||
    result.grossRevenue === undefined ||
    result.transportCost === undefined
  ) {
    return state;
  }

  const freight = freightMultiplier(readCommerce(state).events);
  const transportCost = Math.round(result.transportCost * freight);
  const netCash = result.grossRevenue - transportCost;
  if (netCash <= 0) {
    return state;
  }

  const shipment = createShipment({
    state,
    ownerId: player.id,
    offerId: offer.id,
    itemId: offer.itemId,
    quantity,
    parcel,
    grossRevenue: result.grossRevenue,
    transportCost,
    netCash,
  });

  return {
    ...state,
    inventories: { ...state.inventories, [player.id]: result.stock },
    shipments: [...listShipments(state), shipment],
  };
}

export function applyAcceptContract(
  state: WorldState,
  contractId: string,
  shipFromParcelId: ParcelId,
): WorldState {
  const player = state.players[state.localPlayerId];
  const commerce = readCommerce(state);
  const contract = commerce.contracts.find((entry) => entry.id === contractId);
  const parcel = findParcel(state, shipFromParcelId);
  if (
    !player ||
    !contract ||
    contract.status !== 'open' ||
    !parcel ||
    parcel.ownerId !== player.id
  ) {
    return state;
  }
  const city = state.map.cities.find((entry) => entry.id === contract.cityId);
  if (!city) {
    return state;
  }
  const stock = state.inventories[player.id] ?? {};
  if (getItemQty(stock, contract.itemId) < contract.quantity) {
    return state;
  }
  const removed = removeItem(stock, contract.itemId, contract.quantity);
  if (!removed) {
    return state;
  }
  const path = findPath(state.map, { x: parcel.x, y: parcel.y }, { x: city.x, y: city.y });
  const travel = Math.max(1, path.length - 1);
  const freight = freightMultiplier(commerce.events);
  const transportCost = Math.round(travel * TRANSPORT_RATE_PER_TILE * freight);
  const grossRevenue = contract.unitPrice * contract.quantity;
  const netCash = grossRevenue - transportCost;
  if (netCash <= 0) {
    return state;
  }
  const shipment = createShipment({
    state,
    ownerId: player.id,
    offerId: contract.id,
    itemId: contract.itemId,
    quantity: contract.quantity,
    parcel,
    grossRevenue,
    transportCost,
    netCash,
    to: { x: city.x, y: city.y },
    contractId: contract.id,
  });
  return {
    ...state,
    inventories: { ...state.inventories, [player.id]: removed },
    shipments: [...listShipments(state), shipment],
    commerce: {
      ...commerce,
      contracts: commerce.contracts.map((entry) =>
        entry.id === contract.id
          ? { ...entry, status: 'shipping' as const, shipFromParcelId: parcel.id.value }
          : entry,
      ),
    },
  };
}

export function applyAdvanceDay(
  state: WorldState,
  config: WorldConfig = DEFAULT_WORLD_CONFIG,
): WorldState {
  const taxed = applyTaxTickWithPnl(state, config);
  const playerId = taxed.localPlayerId;
  const closingDay = taxed.gameDay + 1;
  const commerceDay = applyCommerceDay(taxed, closingDay);
  const next = commerceDay.state;
  const player = next.players[playerId];
  let pnl = addPnL(next.pnl[playerId] ?? emptyPnL(), {
    revenue: commerceDay.retailRevenue,
    wages: commerceDay.wages,
    maintenance: commerceDay.upkeep + commerceDay.penalties,
  });

  const factoryCount = Object.values(next.sites).filter(
    (site) =>
      site.phase === 'complete' &&
      site.ownerId === playerId &&
      FACTORY_TYPES[site.factoryTypeId].role === 'production',
  ).length;
  const machineUpkeep = Object.values(next.productionLines).reduce((sum, line) => {
    if (!line.machineGradeId) {
      return sum;
    }
    return sum + MACHINE_GRADES[line.machineGradeId].maintenancePerDay;
  }, 0);
  const maintenance = factoryCount * MAINTENANCE_PER_FACTORY + machineUpkeep;
  let cash = player.cash;
  const paidMaintenance = Math.min(maintenance, cash);
  cash -= paidMaintenance;
  pnl = addPnL(pnl, { maintenance: paidMaintenance });

  const gameDay = closingDay;
  const nextPlayer: Player = { ...player, cash };
  pnl = aggregateProductionIdleLoss(next, playerId, pnl);
  const book = readCommerce(next);

  // 三條勝利路線一起評估：工業化（淨利＋加工產值）、商業（營收＋需求佔比）、
  // 還款（淨利＋累計清償＋零負債）。見 `sales/scenario.ts`。
  const bankBook = getPlayerBank(next, playerId);
  const debt = debtOf(bankBook);
  const scenario = evaluateScenario(next.scenario, gameDay, pnl, {
    craftedValue: craftedValue(next.craftedTotals[playerId]),
    commerce: {
      share: marketShareOf(book),
      consumerRevenue: book.consumerRevenue,
    },
    debtRepaid: bankBook.lifetimeRepaid ?? 0,
    outstandingDebt: debt.principal + debt.arrears,
  });

  return expandNpcBlocks({
    ...next,
    gameDay,
    players: { ...next.players, [playerId]: nextPlayer },
    pnl: { ...next.pnl, [playerId]: pnl },
    npcBuyOffers: generateNpcBuyOffers(gameDay, { rawPriceMul: rawPortMultiplier(book.events) }),
    npcDeals: buildNpcDeals(next.map.cities, gameDay),
    scenario,
  });
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
