import { ITEM_LIST, ITEMS, type ItemId } from '../production/items.js';
import type { Parcel } from '../types/map.js';

/** 主要外銷市場（與供應樞紐 (0,0) 形成區域價差） */
export const MARKET_HUB = { x: 15, y: 11 };

export interface NpcBuyOffer {
  readonly id: string;
  readonly npcNameZh: string;
  readonly itemId: ItemId;
  readonly unitPrice: number;
  readonly floorPrice: number;
  readonly maxQuantity: number;
}

const SELLABLE_ITEMS: ItemId[] = ITEM_LIST.filter((item) => item.sellable).map((item) => item.id);

export function manhattanToMarket(parcel: Parcel): number {
  return Math.abs(parcel.x - MARKET_HUB.x) + Math.abs(parcel.y - MARKET_HUB.y);
}

/** 距離市場越遠，有效單價越低（區域價差） */
export function regionalUnitPrice(
  baseUnitPrice: number,
  floorPrice: number,
  parcel: Parcel,
): number {
  const dist = manhattanToMarket(parcel);
  const spread = Math.max(0.72, 1 - dist * 0.012);
  return Math.max(floorPrice, Math.floor(baseUnitPrice * spread));
}

export function transportCostPerUnit(parcel: Parcel, ratePerTile: number): number {
  return manhattanToMarket(parcel) * ratePerTile;
}

export function generateNpcBuyOffers(gameDay: number): NpcBuyOffer[] {
  const wave = gameDay % 5;
  return SELLABLE_ITEMS.map((itemId) => {
    const base = ITEMS[itemId].unitValue;
    const floorPrice = Math.floor(base * 0.75);
    const unitPrice = Math.floor(base * (0.92 + wave * 0.02));
    return {
      id: `npc-offer-${itemId}-d${gameDay}`,
      npcNameZh: '港區 NPC 收購',
      itemId,
      unitPrice,
      floorPrice,
      maxQuantity: 40 + wave * 5,
    };
  });
}
