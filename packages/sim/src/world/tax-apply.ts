import type { AuctionLot } from '../types/auction.js';
import { clearProductionAtParcel } from './production-reducer.js';
import { processParcelTax } from './tax-logic.js';
import type { WorldConfig } from './config.js';
import type { Player, WorldState } from './state.js';

let taxLotCounter = 50_000;

function nextTaxLotId(): string {
  taxLotCounter += 1;
  return `lot-tax-${taxLotCounter}`;
}

function updateParcelInMap(map: WorldState['map'], parcel: WorldState['map']['parcels'][number]) {
  return {
    ...map,
    parcels: map.parcels.map((p) => (p.id.value === parcel.id.value ? parcel : p)),
  };
}

function updatePlayer(players: WorldState['players'], player: Player): WorldState['players'] {
  return { ...players, [player.id]: player };
}

export function applyTaxTick(state: WorldState, config: WorldConfig): WorldState {
  let map = state.map;
  let players = state.players;
  const unpaidLandTax = { ...state.unpaidLandTax };
  const sites = { ...state.sites };
  let productionLines = { ...state.productionLines };
  const auctionLots: AuctionLot[] = [...state.auctionLots];
  const owned = map.parcels.filter((p) => p.ownerId !== null);

  for (const parcel of owned) {
    const ownerId = parcel.ownerId!;
    const player = players[ownerId];
    if (!player) {
      continue;
    }

    const key = parcel.id.value;
    const currentUnpaid = unpaidLandTax[key] ?? 0;
    const outcome = processParcelTax(parcel, player, currentUnpaid, config, nextTaxLotId());

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
