import type { AuctionLot } from '../types/auction.js';
import type { FactoryTypeId } from '../buildings/catalog.js';
import {
  advanceConstruction,
  applyCancelBuild,
  applyDemolish,
  applyStartBuild,
  getSiteForParcel,
} from '../buildings/build-logic.js';
import type { Parcel, ParcelId } from '../types/map.js';
import { applyBidToLot, settleLot, validateBid } from './auction-logic.js';
import type { WorldAction } from './actions.js';
import { DEFAULT_WORLD_CONFIG, type WorldConfig } from './config.js';
import {
  applyProductionTick,
  applyStartProduction,
  applyStopProduction,
  clearProductionAtParcel,
} from './production-reducer.js';
import { processParcelTax } from './tax-logic.js';
import {
  findOpenLotForParcel,
  findParcel,
  type Player,
  type WorldState,
} from './state.js';

let lotIdCounter = 10_000;
let buildingIdCounter = 20_000;

function nextLotId(): string {
  lotIdCounter += 1;
  return `lot-${lotIdCounter}`;
}

function nextBuildingId(): string {
  buildingIdCounter += 1;
  return `bld-${buildingIdCounter}`;
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
      return applyTaxTick(state, config);
    case 'START_BUILD':
      return applyStart(state, action.parcelId, action.factoryTypeId);
    case 'ADVANCE_BUILD_TICK':
      return applyBuildTick(state);
    case 'CANCEL_BUILD':
      return applyCancel(state, action.parcelId);
    case 'DEMOLISH':
      return applyDemolishAction(state, action.parcelId);
    case 'START_PRODUCTION':
      return applyStartProduction(state, action.parcelId, action.recipeId);
    case 'STOP_PRODUCTION':
      return applyStopProduction(state, action.parcelId);
    case 'ADVANCE_PRODUCTION_TICK':
      return applyProductionTick(state);
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
  if (parcel.ownerId !== null) {
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

  if (result.sold) {
    const key = parcel.id.value;
    nextState = {
      ...nextState,
      unpaidLandTax: { ...nextState.unpaidLandTax, [key]: 0 },
    };
  }

  return nextState;
}

function applyTaxTick(state: WorldState, config: WorldConfig): WorldState {
  let map = state.map;
  let players = state.players;
  const unpaidLandTax = { ...state.unpaidLandTax };
  const sites = { ...state.sites };
  let productionLines = { ...state.productionLines };
  const auctionLots = [...state.auctionLots];
  const owned = map.parcels.filter((p) => p.ownerId !== null);

  for (const parcel of owned) {
    const ownerId = parcel.ownerId!;
    const player = players[ownerId];
    if (!player) {
      continue;
    }

    const key = parcel.id.value;
    const currentUnpaid = unpaidLandTax[key] ?? 0;
    const outcome = processParcelTax(parcel, player, currentUnpaid, config, nextLotId());

    map = updateParcelInMap(map, outcome.parcel);
    if (outcome.player) {
      players = updatePlayer(players, outcome.player);
    }
    if (outcome.reauctioned) {
      delete unpaidLandTax[key];
      delete sites[key];
      productionLines = clearProductionAtParcel(productionLines, key);
      if (outcome.newLot) {
        auctionLots.push(outcome.newLot);
      }
    } else {
      unpaidLandTax[key] = outcome.unpaidLandTax;
    }
  }

  return {
    ...state,
    map,
    players,
    unpaidLandTax,
    sites,
    productionLines,
    auctionLots,
    taxTick: state.taxTick + 1,
  };
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

  return {
    ...state,
    map: updateParcelInMap(state.map, result.parcel),
    players: updatePlayer(state.players, result.player),
    sites: { ...state.sites, [parcelId.value]: result.site },
  };
}

function applyBuildTick(state: WorldState): WorldState {
  let map = state.map;
  const sites = { ...state.sites };

  for (const [key, site] of Object.entries(sites)) {
    if (site.phase !== 'constructing') {
      continue;
    }
    const parcel = map.parcels.find((p) => p.id.value === key);
    if (!parcel) {
      continue;
    }
    const outcome = advanceConstruction(parcel, site, nextBuildingId());
    map = updateParcelInMap(map, outcome.parcel);
    sites[key] = outcome.site;
  }

  return {
    ...state,
    map,
    sites,
    buildTick: state.buildTick + 1,
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
