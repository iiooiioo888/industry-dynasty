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
   * 單位名目價值。由 `VALUE_CHAIN` 依每週期目標毛利反推，
   * 因此加工不會再比投入更便宜。
   *
   * P0 可售範圍：初階產出（原礦、樹脂、煤炭、銅礦、石英砂粒、基礎零件、合金板）
   * 可直接收購，避免銅礦／煤炭／石英砂粒變成試玩死路。
   * 鐵錠、銅錠、矽片仍是中間件，要再加工成合金板才變成可售品。
   */
  readonly unitValue: number;
  readonly sellable: boolean;
}

/**
 * 價值鏈：由**每週期目標毛利**反推各品項單價。
 *
 * 推導式：`產出單價 = (投入單價總和 + 目標毛利) / 產出數量`
 * 由基礎原料往上逐階計算，因此每一階加工的每日毛利都相近，
 * 「加工越深越虧」的結構性問題不會出現。
 *
 * 原版數值表的問題：加工反而虧錢（開採鐵礦 50/日，冶煉鐵錠剩 6.25/日），
 * 而且越高階越虧（合金板 −276/週期），讓加工鏈失去意義。
 */
export const VALUE_CHAIN = {
  /** 每個配方每週期應產生的毛利（未扣持有成本） */
  targetMarginPerCycle: 600,
} as const;

/** 由投入推導產出單價。 */
export function deriveOutputValue(
  inputs: readonly { readonly unitValue: number; readonly quantity: number }[],
  outputQuantity: number,
): number {
  const inputValue = inputs.reduce((sum, i) => sum + i.unitValue * i.quantity, 0);
  return Math.round((inputValue + VALUE_CHAIN.targetMarginPerCycle) / outputQuantity);
}

// 基礎原料（開採產出，無投入）
const V_RAW_ORE = 250;
const V_RESIN = 200;
const V_COAL = 120;
const V_COPPER_ORE = 230;
const V_QUARTZ_GRIT = 180;

// 加工品：逐階由投入推導
const V_IRON_INGOT = deriveOutputValue(
  [
    { unitValue: V_RAW_ORE, quantity: 2 },
    { unitValue: V_COAL, quantity: 1 },
  ],
  1,
);
const V_COPPER_INGOT = deriveOutputValue(
  [
    { unitValue: V_COPPER_ORE, quantity: 2 },
    { unitValue: V_COAL, quantity: 1 },
  ],
  1,
);
const V_SILICA = deriveOutputValue(
  [
    { unitValue: V_QUARTZ_GRIT, quantity: 2 },
    { unitValue: V_COAL, quantity: 1 },
  ],
  1,
);
const V_BASIC_PART = deriveOutputValue(
  [
    { unitValue: V_RAW_ORE, quantity: 2 },
    { unitValue: V_RESIN, quantity: 1 },
  ],
  1,
);
const V_ALLOY_PLATE = deriveOutputValue(
  [
    { unitValue: V_RAW_ORE, quantity: 3 },
    { unitValue: V_BASIC_PART, quantity: 1 },
  ],
  1,
);

export const ITEMS = {
  'raw-ore': { id: 'raw-ore', nameZh: '原礦', tier: 'raw', unitValue: V_RAW_ORE, sellable: true },
  resin: { id: 'resin', nameZh: '樹脂', tier: 'raw', unitValue: V_RESIN, sellable: true },
  coal: { id: 'coal', nameZh: '煤炭', tier: 'raw', unitValue: V_COAL, sellable: true },
  'copper-ore': {
    id: 'copper-ore',
    nameZh: '銅礦',
    tier: 'raw',
    unitValue: V_COPPER_ORE,
    sellable: true,
  },
  'quartz-grit': {
    id: 'quartz-grit',
    nameZh: '石英砂粒',
    tier: 'raw',
    unitValue: V_QUARTZ_GRIT,
    sellable: true,
  },
  'iron-ingot': {
    id: 'iron-ingot',
    nameZh: '鐵錠',
    tier: 'intermediate',
    unitValue: V_IRON_INGOT,
    sellable: false,
  },
  'copper-ingot': {
    id: 'copper-ingot',
    nameZh: '銅錠',
    tier: 'intermediate',
    unitValue: V_COPPER_INGOT,
    sellable: false,
  },
  silica: {
    id: 'silica',
    nameZh: '矽片',
    tier: 'intermediate',
    unitValue: V_SILICA,
    sellable: false,
  },
  'basic-part': {
    id: 'basic-part',
    nameZh: '基礎零件',
    tier: 'intermediate',
    unitValue: V_BASIC_PART,
    sellable: true,
  },
  'alloy-plate': {
    id: 'alloy-plate',
    nameZh: '合金板',
    tier: 'finished',
    unitValue: V_ALLOY_PLATE,
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
