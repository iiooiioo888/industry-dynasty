export type ItemTier = 'raw' | 'intermediate' | 'finished';

export type ItemId =
  | 'raw-ore'
  | 'resin'
  | 'coal'
  | 'copper-ore'
  | 'quartz-grit'
  | 'iron-ingot'
  | 'copper-ingot'
  | 'silica'
  | 'basic-part'
  | 'alloy-plate';

export interface ItemDef {
  readonly id: ItemId;
  readonly nameZh: string;
  readonly tier: ItemTier;
  /**
   * 單位名目價值。初階產出（原礦、樹脂、煤炭、銅礦、石英砂粒、基礎零件、合金板）可直接收購。
   * 鐵錠、銅錠、矽片仍是中間件，要再加工成合金板才變成可售品。
   */
  readonly unitValue: number;
  readonly sellable: boolean;
}

export const ITEMS = {
  'raw-ore': { id: 'raw-ore', nameZh: '原礦', tier: 'raw', unitValue: 50, sellable: true },
  resin: { id: 'resin', nameZh: '樹脂', tier: 'raw', unitValue: 40, sellable: true },
  coal: { id: 'coal', nameZh: '煤炭', tier: 'raw', unitValue: 20, sellable: true },
  'copper-ore': { id: 'copper-ore', nameZh: '銅礦', tier: 'raw', unitValue: 45, sellable: true },
  'quartz-grit': {
    id: 'quartz-grit',
    nameZh: '石英砂粒',
    tier: 'raw',
    unitValue: 28,
    sellable: true,
  },
  'iron-ingot': {
    id: 'iron-ingot',
    nameZh: '鐵錠',
    tier: 'intermediate',
    unitValue: 145,
    sellable: false,
  },
  'copper-ingot': {
    id: 'copper-ingot',
    nameZh: '銅錠',
    tier: 'intermediate',
    unitValue: 140,
    sellable: false,
  },
  silica: { id: 'silica', nameZh: '矽片', tier: 'intermediate', unitValue: 100, sellable: false },
  'basic-part': {
    id: 'basic-part',
    nameZh: '基礎零件',
    tier: 'intermediate',
    unitValue: 180,
    sellable: true,
  },
  'alloy-plate': {
    id: 'alloy-plate',
    nameZh: '合金板',
    tier: 'finished',
    unitValue: 420,
    sellable: true,
  },
} as const satisfies Record<ItemId, ItemDef>;

const ITEM_ORDER: readonly ItemId[] = [
  'raw-ore',
  'resin',
  'coal',
  'copper-ore',
  'quartz-grit',
  'iron-ingot',
  'copper-ingot',
  'silica',
  'basic-part',
  'alloy-plate',
];

export const ITEM_LIST: readonly ItemDef[] = ITEM_ORDER.map((id) => ITEMS[id]);

export type PlayerStock = Readonly<Record<string, number>>;

export function getItemQty(stock: PlayerStock, itemId: string): number {
  return stock[itemId] ?? 0;
}

export function addItem(stock: PlayerStock, itemId: string, qty: number): PlayerStock {
  if (qty <= 0) {
    return stock;
  }
  return { ...stock, [itemId]: getItemQty(stock, itemId) + qty };
}

export function removeItem(stock: PlayerStock, itemId: string, qty: number): PlayerStock | null {
  const have = getItemQty(stock, itemId);
  if (have < qty) {
    return null;
  }
  const next = { ...stock, [itemId]: have - qty };
  if (next[itemId] === 0) {
    delete next[itemId];
  }
  return next;
}

export function hasRecipeInputs(
  stock: PlayerStock,
  inputs: readonly { itemId: string; quantity: number }[],
): boolean {
  return inputs.every((input) => getItemQty(stock, input.itemId) >= input.quantity);
}

export const DEFAULT_STARTING_STOCK: PlayerStock = {
  'raw-ore': 24,
  resin: 18,
};
