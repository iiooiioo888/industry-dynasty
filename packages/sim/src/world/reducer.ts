import type { AuctionLot } from '../types/auction.js';
import type { Parcel, ParcelId } from '../types/map.js';
import { applyBidToLot, settleLot, validateBid } from './auction-logic.js';
import type { WorldAction } from './actions.js';
import { DEFAULT_WORLD_CONFIG, type WorldConfig } from './config.js';
import { processParcelTax } from './tax-logic.js';
import {
  findOpenLotForParcel,
  findParcel,
  type Player,
  type WorldState,
} from './state.js';

let lotIdCounter = 10_000;

function nextLotId(): string {
  lotIdCounter += 1;
  return `lot-${lotIdCounter}`;
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
    auctionLots,
    taxTick: state.taxTick + 1,
  };
}
