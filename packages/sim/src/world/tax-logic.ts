import type { AuctionLot } from '../types/auction.js';
import type { Parcel } from '../types/map.js';
import type { WorldConfig } from './config.js';
import { createAuctionLot } from './auction-logic.js';
import { quoteAuctionMinPrice } from './demand.js';
import type { Player, WorldState } from './state.js';

export interface TaxTickParcelOutcome {
  parcel: Parcel;
  player: Player | null;
  unpaidLandTax: number;
  newLot: AuctionLot | null;
  reauctioned: boolean;
}

export function processParcelTax(
  parcel: Parcel,
  player: Player,
  currentUnpaid: number,
  config: WorldConfig,
  nextLotId: string,
): TaxTickParcelOutcome {
  const taxDue = config.landTaxPerTick;
  const paid = Math.min(taxDue, Math.max(0, player.cash));
  const nextCash = player.cash - paid;
  // 欠稅只能是非負的未繳餘額；現金足夠時 paid === taxDue，不會產生負欠稅。
  let unpaid = currentUnpaid + Math.max(0, taxDue - paid);

  const nextPlayer: Player = { ...player, cash: nextCash };
  let nextParcel = parcel;
  let newLot: AuctionLot | null = null;
  let reauctioned = false;

  if (unpaid >= config.landTaxReauctionThreshold) {
    reauctioned = true;
    unpaid = 0;
    const minPrice = quoteAuctionMinPrice(parcel, config);
    newLot = createAuctionLot(parcel.id, minPrice, nextLotId);
    nextParcel = {
      ...parcel,
      state: 'empty',
      ownerId: null,
    };
  }

  return {
    parcel: nextParcel,
    player: nextPlayer,
    unpaidLandTax: unpaid,
    newLot,
    reauctioned,
  };
}

export function countOwnedParcels(state: WorldState, playerId: string): number {
  return state.map.parcels.filter((p) => p.ownerId === playerId).length;
}
