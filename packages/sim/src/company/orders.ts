import { ITEM_LIST, ITEMS, getItemQty, removeItem, type ItemId } from '../production/items.js';
import { addPnL, emptyPnL } from '../sales/pnl.js';
import type { ParcelId } from '../types/map.js';
import { findParcel, getPlayerInventory, type WorldState } from '../world/state.js';

/** 低於港區全額收購，但不收運費。沒有交貨就不發生。 */
export const CITY_ORDER_PAY_RATE = 0.9;

const SELLABLE_IDS: readonly ItemId[] = ITEM_LIST.filter((item) => item.sellable).map((item) => item.id);

export interface CitySupplyOrder {
  readonly id: string;
  readonly cityId: string;
  readonly cityName: string;
  readonly itemId: ItemId;
  readonly nameZh: string;
  readonly quantity: number;
  readonly unitPay: number;
  readonly filled: number;
}

export function listCityOrders(state: WorldState): readonly CitySupplyOrder[] {
  const day = state.gameDay;
  const fills = state.orderFills ?? {};
  return state.map.cities.map((city, index) => {
    const itemId = SELLABLE_IDS[(day + index) % SELLABLE_IDS.length]!;
    const item = ITEMS[itemId];
    const id = `city-order-${city.id}-d${day}`;
    const quantity = 2 + ((day + index) % 3);
    return {
      id,
      cityId: city.id,
      cityName: city.name,
      itemId,
      nameZh: item.nameZh,
      quantity,
      unitPay: Math.floor(item.unitValue * CITY_ORDER_PAY_RATE),
      filled: fills[id] ?? 0,
    };
  });
}

export function fillCityOrder(
  state: WorldState,
  orderId: string,
  quantity: number,
  parcelId: ParcelId,
): WorldState {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return state;
  }
  const order = listCityOrders(state).find((entry) => entry.id === orderId);
  const player = state.players[state.localPlayerId];
  const parcel = findParcel(state, parcelId);
  if (!order || !player || !parcel || parcel.ownerId !== player.id) {
    return state;
  }
  if (quantity > order.quantity - order.filled) {
    return state;
  }
  const stock = getPlayerInventory(state, player.id);
  if (getItemQty(stock, order.itemId) < quantity) {
    return state;
  }
  const nextStock = removeItem(stock, order.itemId, quantity);
  if (!nextStock) {
    return state;
  }
  const gross = order.unitPay * quantity;
  return {
    ...state,
    inventories: { ...state.inventories, [player.id]: nextStock },
    players: {
      ...state.players,
      [player.id]: { ...player, cash: player.cash + gross },
    },
    pnl: {
      ...state.pnl,
      [player.id]: addPnL(state.pnl[player.id] ?? emptyPnL(), { revenue: gross }),
    },
    orderFills: { ...(state.orderFills ?? {}), [order.id]: order.filled + quantity },
  };
}
