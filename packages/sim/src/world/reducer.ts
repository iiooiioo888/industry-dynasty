import {
  applyBuyCommodity,
  applyBuyBond,
  applyBuyStock,
  applyCancelLimit,
  applyPlaceLimit,
  applyDrawLoan,
  applyOpenSavings,
  applyRepayLoan,
  applySellBond,
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
import { consumeBuildMaterials } from '../buildings/materials.js';
import { quoteLandSale } from './land-sale.js';
import { applyTaxTickWithPnl } from './day-reducer.js';
import { bumpPlayerPnl } from './pnl-helpers.js';
import { applyNpcDeal } from '../npc/deals.js';
import {
  applyBuyCampaign,
  applyFireStaff,
  applyHireStaff,
  applySetShelf,
  applyStartResearch,
} from '../commerce/logic.js';
import type { ResearchId } from '../commerce/research.js';
import {
  applyAcceptContract,
  applyAdvanceDay,
  applyBidContract,
  applySellToNpc,
} from './sales-reducer.js';
import { findOpenLotForParcel, findParcel, type Player, type WorldState } from './state.js';

function cashOf(state: WorldState): number {
  return state.players[state.localPlayerId]?.cash ?? 0;
}

function chargeWages(before: WorldState, after: WorldState): WorldState {
  const spent = cashOf(before) - cashOf(after);
  if (spent <= 0) {
    return after;
  }
  return { ...after, pnl: bumpPlayerPnl(after, before.localPlayerId, { wages: spent }) };
}

function chargeBuild(before: WorldState, after: WorldState): WorldState {
  const spent = cashOf(before) - cashOf(after);
  if (spent <= 0) {
    return after;
  }
  return { ...after, pnl: bumpPlayerPnl(after, before.localPlayerId, { buildSpend: spent }) };
}

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
    case 'SET_SHELF':
      return applySetShelf(
        state,
        action.parcelId,
        action.itemId,
        action.unitPrice,
        action.quantity,
      );
    case 'BID_CONTRACT':
      return applyBidContract(state, action.contractId, action.unitPrice);
    case 'ACCEPT_CONTRACT':
      return applyAcceptContract(state, action.contractId, action.shipFromParcelId);
    case 'HIRE_STAFF':
      return chargeWages(state, applyHireStaff(state, action.role, action.count));
    case 'FIRE_STAFF':
      return applyFireStaff(state, action.role, action.count);
    case 'START_RESEARCH':
      return chargeBuild(
        state,
        applyStartResearch(
          state,
          action.parcelId,
          (action.researchId as ResearchId | undefined) ?? undefined,
        ),
      );
    case 'BUY_CAMPAIGN':
      return chargeBuild(state, applyBuyCampaign(state, action.cityId));
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
    case 'PLACE_LIMIT':
      return applyPlaceLimit(
        state,
        action.marketId,
        action.side,
        action.limitPrice,
        action.quantity,
      );
    case 'CANCEL_LIMIT':
      return applyCancelLimit(state, action.orderId);
    case 'BUY_BOND':
      return applyBuyBond(state, action.bondId, action.units);
    case 'ACCEPT_NPC_DEAL':
      return applyNpcDeal(state, action.dealId);
    case 'SELL_BOND':
      return applySellBond(state, action.bondId, action.units);
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

  // 擴廠要吃材料（見 `buildings/materials.ts`）：工坊免材料，其餘要備料。
  // 材料不足就整筆擋下、狀態不變 —— 呼叫端必須先確認庫存。
  const nextStock = consumeBuildMaterials(state.inventories[player.id], factoryTypeId);
  if (!nextStock) {
    return state;
  }

  const factoryType = FACTORY_TYPES[factoryTypeId];
  return {
    ...state,
    inventories: { ...state.inventories, [player.id]: nextStock },
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

  return {
    ...state,
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

  return {
    ...state,
    map: updateParcelInMap(state.map, applyDemolish(parcel)),
    sites,
    productionLines,
  };
}
