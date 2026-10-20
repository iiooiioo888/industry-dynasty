import { debtOf, getPlayerBank } from '../bank/logic.js';
import { ITEMS, type ItemId } from '../production/items.js';
import { quoteAuctionMinPrice } from '../world/demand.js';
import { DEFAULT_WORLD_CONFIG } from '../world/config.js';
import type { WorldState } from '../world/state.js';
import { brandOf } from './retail.js';

/** 顯示用。不改 won / lost。 */
export function companyScore(state: WorldState, playerId: string = state.localPlayerId): number {
  const cash = state.players[playerId]?.cash ?? 0;
  const stock = state.inventories[playerId] ?? {};
  let inventory = 0;
  for (const [itemId, qty] of Object.entries(stock)) {
    const item = ITEMS[itemId as ItemId];
    if (item && qty > 0) {
      inventory += item.unitValue * qty;
    }
  }
  let land = 0;
  for (const parcel of state.map.parcels) {
    if (parcel.ownerId === playerId) {
      land += quoteAuctionMinPrice(parcel, DEFAULT_WORLD_CONFIG);
    }
  }
  const debt = debtOf(getPlayerBank(state, playerId));
  return cash + inventory + land + brandOf(state) * 100 - debt.principal - debt.arrears;
}
