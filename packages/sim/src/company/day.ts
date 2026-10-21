import { addPnL, emptyPnL } from '../sales/pnl.js';
import { generateNpcBuyOffers, type NpcBuyOffer } from '../sales/market.js';
import type { WorldState } from '../world/state.js';
import { eventForDay, type MarketEvent } from './events.js';
import { decayBrand, settleStorefronts } from './retail.js';
import { advanceRivals, readRivals } from './rivals.js';
import { dailyWage } from './staff.js';

export function applyEventToOffers(
  offers: readonly NpcBuyOffer[],
  event: MarketEvent,
): readonly NpcBuyOffer[] {
  if (event.orePriceMultiplier === 1) {
    return offers;
  }
  return offers.map((offer) =>
    offer.itemId === 'raw-ore'
      ? { ...offer, unitPrice: Math.floor(offer.unitPrice * event.orePriceMultiplier) }
      : offer,
  );
}

/**
 * 日結的經營段：薪資、品牌衰減、對手市占、門市成交、當日事件。
 * 沒有員工、門市或廣告時，港區收購單只在原料緊俏那幾天改原礦價。
 */
export function applyOperatingClose(state: WorldState): WorldState {
  const playerId = state.localPlayerId;
  const player = state.players[playerId];
  if (!player) {
    return state;
  }

  const wage = dailyWage(state);
  const paidWage = Math.min(wage, player.cash);
  const pnl = addPnL(state.pnl[playerId] ?? emptyPnL(), {
    maintenance: paidWage > 0 ? paidWage : 0,
  });
  let next: WorldState = {
    ...state,
    players: {
      ...state.players,
      [playerId]: { ...player, cash: player.cash - paidWage },
    },
    pnl: { ...state.pnl, [playerId]: pnl },
    brand: decayBrand(state.brand ?? 0),
  };

  const rivals = advanceRivals(readRivals(next.rivals, next.map.cities), next.gameDay);
  const todayEvent = eventForDay(next.gameDay);
  next = { ...next, rivals, todayEvent };
  next = settleStorefronts(next, todayEvent, rivals);
  return {
    ...next,
    npcBuyOffers: applyEventToOffers(generateNpcBuyOffers(next.gameDay), todayEvent),
  };
}
