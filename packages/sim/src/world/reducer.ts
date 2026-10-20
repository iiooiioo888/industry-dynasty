import {
  applyBuyCommodity,
  applyBuyStock,
  applyDrawLoan,
  applyOpenSavings,
  applyRepayLoan,
  applySellCommodity,
  applySellStock,
  applyWithdrawSavings,
  settleFinancePeriod,
} from '../bank/logic.js';
import type { AuctionLot } from '../types/auction.js';
import { FACTORY_TYPES, type FactoryTypeId } from '../buildings/catalog.js';
import {
  applyCancelBuild,
  applyDemolish,
  applyStartBuild,
  getSiteForParcel,
} from '../buildings/build-logic.js';
import { applyBuildTick } from './build-reducer.js';
import type { Parcel, ParcelId } from '../types/map.js';
import { applyBidToLot, settleLot, validateBid } from './auction-logic.js';
import type { WorldAction } from './actions.js';
import { DEFAULT_WORLD_CONFIG, type WorldConfig } from './config.js';
import {
  applyInstallMachine,
  applyStartProduction,
  applyStopProduction,
  clearProductionAtParcel,
} from './production-reducer.js';
import { advanceSimClock, setSimClock, stepOneSimTick } from './clock-advance.js';
import { quoteLandSale } from './land-sale.js';
import { applyTaxTickWithPnl } from './day-reducer.js';
import { bumpPlayerPnl } from './pnl-helpers.js';
import { applyAdvanceDay, applySellToNpc } from './sales-reducer.js';
import { assignStaff, dismissStaff, hireStaff, releaseStaffAt } from '../company/staff.js';
import { unlockResearch } from '../company/research.js';
import { fillCityOrder } from '../company/orders.js';
import { buyAdvert, setShelfPrice } from '../company/retail.js';
import { dispatchSupply, releaseSiteBin } from '../supply/haul.js';
import { applyWithdrawCommodity } from '../supply/intake.js';
import { findOpenLotForParcel, findParcel, type Player, type WorldState } from './state.js';

function updateParcelInMap(map: WorldState['map'], parcel: Parcel): WorldState['map'] {
  return {
    ...map,
    parcels: map.parcels.map((p) => (p.id.value === parcel.id.value ? parcel : p)),
  };
}

function updatePlayer(players: WorldState['players'], player: Player): WorldState['players'] {
  return { ...players, [player.id]: player };
}

function replaceLot(lots: readonly AuctionLot[], updated: AuctionLot): AuctionLot[] {
  return lots.map((lot) => (lot.id === updated.id ? updated : lot));
}

export function applyWorldAction(
  state: WorldState,
  action: WorldAction,
  config: WorldConfig = DEFAULT_WORLD_CONFIG,
): WorldState {
  switch (action.type) {
    case 'BID':
      return applyBid(state, action.parcelId, action.amount);
    case 'SETTLE_AUCTION':
      return applySettle(state, action.parcelId);
    case 'ADVANCE_TAX_TICK':
      return applyTaxTickWithPnl(state, config);
    case 'SELL_TO_NPC':
      return applySellToNpc(state, action.offerId, action.quantity, action.shipFromParcelId);
    case 'ADVANCE_DAY':
      return applyAdvanceDay(state, config);
    case 'ADVANCE_FINANCE_TICK':
      return settleFinancePeriod(state, config.bank);
    case 'OPEN_SAVINGS':
      return applyOpenSavings(state, action.amount, config.bank);
    case 'WITHDRAW_SAVINGS':
      return applyWithdrawSavings(state);
    case 'DRAW_LOAN':
      return applyDrawLoan(state, action.productId, action.amount, config.bank);
    case 'REPAY_LOAN':
      return applyRepayLoan(state, action.loanId, action.amount);
    case 'BUY_STOCK':
      return applyBuyStock(state, action.symbol, action.shares);
    case 'SELL_STOCK':
      return applySellStock(state, action.symbol, action.shares);
    case 'BUY_COMMODITY':
      return applyBuyCommodity(state, action.commodityId, action.lots);
    case 'SELL_COMMODITY':
      return applySellCommodity(state, action.commodityId, action.lots, config.bank);
    case 'START_BUILD':
      return applyStart(state, action.parcelId, action.factoryTypeId);
    case 'ADVANCE_BUILD_TICK':
      return applyBuildTick(state);
    case 'CANCEL_BUILD':
      return applyCancel(state, action.parcelId);
    case 'DEMOLISH':
      return applyDemolishAction(state, action.parcelId);
    case 'SELL_LAND':
      return applySellLand(state, action.parcelId, config);
    case 'START_PRODUCTION':
      return applyStartProduction(state, action.parcelId, action.recipeId, action.machineGradeId);
    case 'INSTALL_MACHINE':
      return applyInstallMachine(state, action.parcelId, action.machineGradeId);
    case 'STOP_PRODUCTION':
      return applyStopProduction(state, action.parcelId);
    case 'ADVANCE_PRODUCTION_TICK':
      return stepOneSimTick(state, config);
    case 'SET_CLOCK':
      return setSimClock(state, { paused: action.paused, speed: action.speed });
    case 'ADVANCE_SIM_TIME':
      return advanceSimClock(state, action.deltaMs, config);
    case 'HIRE_STAFF':
      return hireStaff(state, action.candidateId);
    case 'DISMISS_STAFF':
      return dismissStaff(state, action.staffId);
    case 'ASSIGN_STAFF':
      return assignStaff(state, action.staffId, action.parcelId);
    case 'UNLOCK_RESEARCH':
      return unlockResearch(state, action.projectId);
    case 'SET_SHELF_PRICE':
      return setShelfPrice(state, action.parcelId, action.itemId, action.unitPrice);
    case 'BUY_ADVERT':
      return buyAdvert(state, action.spend);
    case 'WITHDRAW_COMMODITY':
      return applyWithdrawCommodity(state, action.commodityId, action.lots);
    case 'FILL_CITY_ORDER':
      return fillCityOrder(state, action.orderId, action.quantity, action.shipFromParcelId);
    case 'DISPATCH_SUPPLY':
      return dispatchSupply(state, {
        toParcelId: action.toParcelId,
        itemId: action.itemId,
        quantity: action.quantity,
        fromParcelId: action.fromParcelId,
      });
    default:
      return state;
  }
}

function applyBid(state: WorldState, parcelId: ParcelId, amount: number): WorldState {
  const lot = findOpenLotForParcel(state, parcelId);
  const player = state.players[state.localPlayerId];
  const parcel = findParcel(state, parcelId);
  if (!lot || !player || !parcel) {
    return state;
  }
  if (parcel.ownerId !== null || parcel.role !== 'land') {
    return state;
  }

  const validation = validateBid(lot, player, amount);
  if (!validation.ok) {
    return state;
  }

  const updatedLot = applyBidToLot(lot, player.id, amount);
  return {
    ...state,
    auctionLots: replaceLot(state.auctionLots, updatedLot),
  };
}

function applySettle(state: WorldState, parcelId: ParcelId): WorldState {
  const lot = findOpenLotForParcel(state, parcelId);
  const parcel = findParcel(state, parcelId);
  if (!lot || !parcel) {
    return state;
  }

  const bidderId = lot.highBidderId;
  const bidder = bidderId ? state.players[bidderId] : undefined;
  const result = settleLot(lot, parcel, bidder);
  if (!result.sold) {
    return state;
  }

  let nextState: WorldState = {
    ...state,
    map: updateParcelInMap(state.map, result.parcel),
    auctionLots: replaceLot(state.auctionLots, result.lot),
  };

  if (result.player) {
    nextState = {
      ...nextState,
      players: updatePlayer(nextState.players, result.player),
    };
  }

  if (result.sold && result.player && lot.highBidderId) {
    const key = parcel.id.value;
    const spend = lot.highBid;
    nextState = {
      ...nextState,
      unpaidLandTax: { ...nextState.unpaidLandTax, [key]: 0 },
      pnl: bumpPlayerPnl(nextState, lot.highBidderId, { auctionSpend: spend }),
    };
  }

  return nextState;
}

function applyStart(
  state: WorldState,
  parcelId: ParcelId,
  factoryTypeId: FactoryTypeId,
): WorldState {
  const parcel = findParcel(state, parcelId);
  const player = state.players[state.localPlayerId];
  if (!parcel || !player) {
    return state;
  }

  const existingSite = getSiteForParcel(state.sites, parcelId);
  const result = applyStartBuild(parcel, player, factoryTypeId, existingSite);
  if (!result.ok || !result.parcel || !result.player || !result.site) {
    return state;
  }

  const factoryType = FACTORY_TYPES[factoryTypeId];
  return {
    ...state,
    map: updateParcelInMap(state.map, result.parcel),
    players: updatePlayer(state.players, result.player),
    sites: {
      ...state.sites,
      [parcelId.value]: { ...result.site, progressAnchorMs: state.clock.simMs },
    },
    pnl: bumpPlayerPnl(state, player.id, { buildSpend: factoryType.buildCost }),
  };
}

/**
 * 土地轉手：把自有土地換回現金，地塊回到可拍賣的空地。
 *
 * 轉手價見 `world/land-sale.ts`（估價 × 時間成長 × 轉手折價）。
 * 收入記在 `landSaleProceeds`，與販售貨物的 `revenue` 分開，
 * 才看得出地產操作對淨利的實際貢獻。
 * 建造進度仍只走 `build-reducer`／模擬時鐘，這裡不另開一條建設計數。
 */
function applySellLand(state: WorldState, parcelId: ParcelId, config: WorldConfig): WorldState {
  const parcel = findParcel(state, parcelId);
  const player = state.players[state.localPlayerId];
  if (!parcel || !player) {
    return state;
  }
  const hasBuilding = getSiteForParcel(state.sites, parcelId) !== undefined;
  const quote = quoteLandSale(parcel, player.id, config, state.gameDay, hasBuilding);
  if (!quote.ok) {
    return state;
  }

  const nextParcel: Parcel = { ...parcel, state: 'empty', ownerId: null };
  const sites = { ...state.sites };
  delete sites[parcelId.value];
  const productionLines = { ...state.productionLines };
  delete productionLines[parcelId.value];
  const unpaidLandTax = { ...state.unpaidLandTax, [parcelId.value]: 0 };
  const released = releaseSiteBin(releaseStaffAt(state, parcelId.value), parcelId.value);

  return {
    ...released,
    map: updateParcelInMap(state.map, nextParcel),
    sites,
    productionLines,
    unpaidLandTax,
    players: { ...state.players, [player.id]: { ...player, cash: player.cash + quote.proceeds } },
    pnl: bumpPlayerPnl(state, player.id, { landSaleProceeds: quote.proceeds }),
  };
}

function applyCancel(state: WorldState, parcelId: ParcelId): WorldState {
  const parcel = findParcel(state, parcelId);
  const player = state.players[state.localPlayerId];
  const site = getSiteForParcel(state.sites, parcelId);
  if (!parcel || !player || !site || site.phase !== 'constructing' || site.ownerId !== player.id) {
    return state;
  }

  const { parcel: nextParcel, player: nextPlayer } = applyCancelBuild(parcel, player, site);
  const sites = { ...state.sites };
  delete sites[parcelId.value];

  return {
    ...state,
    map: updateParcelInMap(state.map, nextParcel),
    players: updatePlayer(state.players, nextPlayer),
    sites,
  };
}

function applyDemolishAction(state: WorldState, parcelId: ParcelId): WorldState {
  const parcel = findParcel(state, parcelId);
  const player = state.players[state.localPlayerId];
  const site = getSiteForParcel(state.sites, parcelId);
  if (!parcel || !player || !site || site.phase !== 'complete' || site.ownerId !== player.id) {
    return state;
  }

  const sites = { ...state.sites };
  delete sites[parcelId.value];
  const productionLines = clearProductionAtParcel(state.productionLines, parcelId.value);
  const released = releaseSiteBin(releaseStaffAt(state, parcelId.value), parcelId.value);

  return {
    ...released,
    map: updateParcelInMap(state.map, applyDemolish(parcel)),
    sites,
    productionLines,
  };
}
