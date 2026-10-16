export type ItemId = 'raw-ore' | 'resin' | 'basic-part' | 'alloy-plate';

export interface ItemDef {
  readonly id: ItemId;
  readonly nameZh: string;
  /** 單位名目價值（Sprint 3 用於可見利潤／損失） */
  readonly unitValue: number;
}

export const ITEMS: Record<ItemId, ItemDef> = {
  'raw-ore': { id: 'raw-ore', nameZh: '原礦', unitValue: 50 },
  resin: { id: 'resin', nameZh: '樹脂', unitValue: 40 },
  'basic-part': { id: 'basic-part', nameZh: '基礎零件', unitValue: 180 },
  'alloy-plate': { id: 'alloy-plate', nameZh: '合金板', unitValue: 420 },
};

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
