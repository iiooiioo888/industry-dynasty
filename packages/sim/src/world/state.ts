import type { ParcelSite } from '../buildings/site.js';
import type { AuctionLot } from '../types/auction.js';
import type { GameMap, Parcel, ParcelId } from '../types/map.js';

export interface Player {
  readonly id: string;
  readonly name: string;
  readonly cash: number;
}

export interface WorldState {
  readonly map: GameMap;
  readonly players: Readonly<Record<string, Player>>;
  readonly localPlayerId: string;
  readonly auctionLots: readonly AuctionLot[];
  /** 各土地累計欠稅（僅持有期間累積，收回後清零） */
  readonly unpaidLandTax: Readonly<Record<string, number>>;
  readonly taxTick: number;
  readonly buildTick: number;
  /** 土地上的工地／完工建築，key = parcelId.value */
  readonly sites: Readonly<Record<string, ParcelSite>>;
}

export function findParcel(state: WorldState, parcelId: ParcelId): Parcel | undefined {
  return state.map.parcels.find((p) => p.id.value === parcelId.value);
}

export function findOpenLotForParcel(
  state: WorldState,
  parcelId: ParcelId,
): AuctionLot | undefined {
  return state.auctionLots.find(
    (lot) => lot.parcelId.value === parcelId.value && lot.status === 'open',
  );
}

export function getPlayerHoldings(state: WorldState, playerId: string): readonly Parcel[] {
  return state.map.parcels.filter((p) => p.ownerId === playerId);
}

export function getSite(state: WorldState, parcelId: ParcelId): ParcelSite | undefined {
  return state.sites[parcelId.value];
}
