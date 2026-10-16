import type { PlayerBank } from '../bank/types.js';
import type { ParcelSite } from '../buildings/site.js';
import type { NpcBuyOffer } from '../sales/market.js';
import type { PnLSummary } from '../sales/pnl.js';
import type { ScenarioState } from '../sales/scenario.js';
import type { ProductionLine } from '../production/production-line.js';
import type { PlayerStock } from '../production/items.js';
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
  readonly unpaidLandTax: Readonly<Record<string, number>>;
  readonly taxTick: number;
  readonly buildTick: number;
  readonly productionTick: number;
  /** 銀行週期。稅務週期與結束本日都會一起前進。 */
  readonly financeTick: number;
  readonly bank: Readonly<Record<string, PlayerBank>>;
  readonly sites: Readonly<Record<string, ParcelSite>>;
  readonly inventories: Readonly<Record<string, PlayerStock>>;
  /** 實際入庫累計（不含開局配給），用來解鎖下一階段配方 */
  readonly craftedTotals: Readonly<Record<string, PlayerStock>>;
  readonly productionLines: Readonly<Record<string, ProductionLine>>;
  readonly gameDay: number;
  readonly npcBuyOffers: readonly NpcBuyOffer[];
  readonly pnl: Readonly<Record<string, PnLSummary>>;
  readonly scenario: ScenarioState;
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

export function getPlayerInventory(state: WorldState, playerId: string): PlayerStock {
  return state.inventories[playerId] ?? {};
}

export function getProductionLine(
  state: WorldState,
  parcelId: ParcelId,
): ProductionLine | undefined {
  return state.productionLines[parcelId.value];
}
