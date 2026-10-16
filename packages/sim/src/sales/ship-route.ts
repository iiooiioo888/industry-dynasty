import { ITEMS } from '../production/items.js';
import type { Parcel, ParcelId } from '../types/map.js';
import type { NpcBuyOffer } from './market.js';
import { manhattanToMarket, MARKET_HUB } from './market.js';

/** 較舊版 8 已調低；搭配貨值加權，避免全圖硬鎖死 */
export const TRANSPORT_RATE_PER_TILE = 3;

export interface ShipRouteQuote {
  readonly parcel: Parcel;
  readonly hubUnitPrice: number;
  /** 與 hubUnitPrice 相同，供舊 UI 欄位相容 */
  readonly unitPrice: number;
  readonly transportPerUnit: number;
  readonly netPerUnit: number;
  readonly distanceToMarket: number;
}

/** 重貨運輸貴、輕貨相對便宜，保留「空間效率」但不全圖無法賣 */
export function transportCostPerUnit(
  parcel: Parcel,
  ratePerTile: number,
  itemUnitValue: number,
): number {
  const dist = manhattanToMarket(parcel);
  const cargoFactor = Math.max(0.35, Math.min(1.15, itemUnitValue / 180));
  return Math.floor(dist * ratePerTile * cargoFactor);
}

export function findBestShipParcel(holdings: readonly Parcel[]): Parcel | undefined {
  if (holdings.length === 0) {
    return undefined;
  }
  return holdings.reduce((best, p) =>
    manhattanToMarket(p) < manhattanToMarket(best) ? p : best,
  );
}

export function resolveShipParcel(
  holdings: readonly Parcel[],
  preferred: Parcel | undefined,
): Parcel | undefined {
  if (
    preferred &&
    preferred.ownerId &&
    holdings.some((h) => h.id.value === preferred.id.value)
  ) {
    return preferred;
  }
  return findBestShipParcel(holdings);
}

/** NPC 以港區牌價收購；運輸為出貨點至市場的距離成本（不再疊加區域折價） */
export function quoteShipRoute(offer: NpcBuyOffer, parcel: Parcel): ShipRouteQuote {
  const hubUnitPrice = offer.unitPrice;
  const unitValue = ITEMS[offer.itemId].unitValue;
  const transportPerUnit = transportCostPerUnit(parcel, TRANSPORT_RATE_PER_TILE, unitValue);
  const netPerUnit = hubUnitPrice - transportPerUnit;
  return {
    parcel,
    hubUnitPrice,
    unitPrice: hubUnitPrice,
    transportPerUnit,
    netPerUnit,
    distanceToMarket: manhattanToMarket(parcel),
  };
}

export function isAtMarketHub(parcel: Parcel): boolean {
  return parcel.x === MARKET_HUB.x && parcel.y === MARKET_HUB.y;
}

export function parcelIdEquals(a: ParcelId, b: ParcelId): boolean {
  return a.value === b.value;
}
