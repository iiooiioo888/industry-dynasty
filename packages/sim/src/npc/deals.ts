import { addItem, getItemQty, ITEMS, removeItem } from '../production/items.js';
import { addPnL, emptyPnL } from '../sales/pnl.js';
import type { CityHub } from '../types/map.js';
import type { WorldState } from '../world/state.js';
import { npcById, type NpcDeal } from './roster.js';

export type { NpcDeal, NpcDealSide } from './roster.js';

const SUPPLIER_GOODS = ['raw-ore', 'resin', 'coal', 'copper-ore', 'quartz-grit'] as const;
const KEEPER_GOODS = ['hand-tool', 'wire-bundle', 'pack-module', 'alloy-plate'] as const;
const PORT_GOODS = ['raw-ore', 'resin', 'coal', 'basic-part', 'alloy-plate'] as const;

const KEEPERS = [
  { npcId: 'jiang-bei', cityId: 'xiwan' },
  { npcId: 'lin-kou', cityId: 'lingang' },
  { npcId: 'he-zhan', cityId: 'nanzhan' },
] as const;

export function buildNpcDeals(cities: readonly CityHub[], gameDay: number): NpcDeal[] {
  const present = new Set(cities.map((city) => city.id));
  const day = Math.max(0, gameDay);
  const supplied = SUPPLIER_GOODS[day % SUPPLIER_GOODS.length] ?? 'raw-ore';
  const portItem = PORT_GOODS[day % PORT_GOODS.length] ?? 'raw-ore';
  const deals: NpcDeal[] = [
    {
      id: `npc-zhou-${day}`,
      npcId: 'zhou-liao',
      side: 'npc-sells',
      itemId: supplied,
      quantity: 6,
      unitPrice: Math.ceil(ITEMS[supplied].unitValue * 1.35),
    },
    {
      id: `npc-shen-${day}`,
      npcId: 'shen-bu',
      side: 'npc-buys',
      itemId: portItem,
      quantity: 4,
      unitPrice: Math.floor(ITEMS[portItem].unitValue * 1.06),
    },
  ];
  KEEPERS.forEach((keeper, index) => {
    if (!present.has(keeper.cityId)) {
      return;
    }
    const itemId = KEEPER_GOODS[(day + index) % KEEPER_GOODS.length] ?? 'hand-tool';
    deals.push({
      id: `npc-${keeper.npcId}-${day}`,
      npcId: keeper.npcId,
      side: 'npc-buys',
      itemId,
      quantity: 2,
      unitPrice: Math.floor(ITEMS[itemId].unitValue * 0.78),
    });
  });
  return deals;
}

export function listNpcDeals(state: WorldState): readonly NpcDeal[] {
  return state.npcDeals ?? [];
}

export function applyNpcDeal(state: WorldState, dealId: string): WorldState {
  const player = state.players[state.localPlayerId];
  const deal = listNpcDeals(state).find((item) => item.id === dealId);
  if (!player || !deal || !npcById(deal.npcId)) {
    return state;
  }
  const stock = state.inventories[player.id] ?? {};
  const total = deal.unitPrice * deal.quantity;
  if (deal.side === 'npc-sells') {
    if (player.cash < total) {
      return state;
    }
    return {
      ...state,
      players: { ...state.players, [player.id]: { ...player, cash: player.cash - total } },
      inventories: { ...state.inventories, [player.id]: addItem(stock, deal.itemId, deal.quantity) },
      npcDeals: listNpcDeals(state).filter((item) => item.id !== deal.id),
    };
  }
  if (getItemQty(stock, deal.itemId) < deal.quantity) {
    return state;
  }
  const removed = removeItem(stock, deal.itemId, deal.quantity);
  if (!removed) {
    return state;
  }
  const pnl = addPnL(state.pnl[player.id] ?? emptyPnL(), { revenue: total });
  return {
    ...state,
    players: { ...state.players, [player.id]: { ...player, cash: player.cash + total } },
    inventories: { ...state.inventories, [player.id]: removed },
    pnl: { ...state.pnl, [player.id]: pnl },
    npcDeals: listNpcDeals(state).filter((item) => item.id !== deal.id),
  };
}
