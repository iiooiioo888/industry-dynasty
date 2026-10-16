import { getItemQty, removeItem, type PlayerStock } from '../production/items.js';
import type { Parcel } from '../types/map.js';
import type { NpcBuyOffer } from './market.js';
import { MARKET_HUB } from './market.js';

const MARKET_HUB_LABEL = `${MARKET_HUB.x},${MARKET_HUB.y}`;
import {
  quoteShipRoute,
  TRANSPORT_RATE_PER_TILE,
  transportCostPerUnit,
  type ShipRouteQuote,
} from './ship-route.js';

export { TRANSPORT_RATE_PER_TILE, transportCostPerUnit };

export type SellQuote = ShipRouteQuote;

export function quoteSale(offer: NpcBuyOffer, parcel: Parcel): SellQuote {
  return quoteShipRoute(offer, parcel);
}

export interface SellResult {
  ok: boolean;
  reason?: string;
  stock?: PlayerStock;
  grossRevenue?: number;
  transportCost?: number;
  netCash?: number;
}

export function executeSellToNpc(
  offer: NpcBuyOffer,
  quantity: number,
  parcel: Parcel,
  stock: PlayerStock,
  ownerId: string,
): SellResult {
  if (quantity <= 0) {
    return { ok: false, reason: '數量須大於 0' };
  }
  if (quantity > offer.maxQuantity) {
    return { ok: false, reason: `超過 NPC 收購上限 ${offer.maxQuantity}` };
  }
  if (parcel.ownerId !== ownerId) {
    return { ok: false, reason: '必須從你的土地出貨' };
  }
  if (getItemQty(stock, offer.itemId) < quantity) {
    return { ok: false, reason: '庫存不足' };
  }

  const quote = quoteSale(offer, parcel);
  if (quote.netPerUnit <= 0) {
    return {
      ok: false,
      reason: `運輸 $${quote.transportPerUnit}/單 高於港價 $${quote.hubUnitPrice}，請選更靠近市場 (${MARKET_HUB_LABEL}) 的土地`,
    };
  }

  const removed = removeItem(stock, offer.itemId, quantity);
  if (!removed) {
    return { ok: false, reason: '庫存不足' };
  }

  const grossRevenue = quote.hubUnitPrice * quantity;
  const transportCost = quote.transportPerUnit * quantity;
  const netCash = grossRevenue - transportCost;

  return {
    ok: true,
    stock: removed,
    grossRevenue,
    transportCost,
    netCash,
  };
}

export function findOfferById(offers: readonly NpcBuyOffer[], offerId: string): NpcBuyOffer | undefined {
  return offers.find((o) => o.id === offerId);
}
