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
 * 由基礎原料往上逐階計算。
 *
 * **目標毛利隨週期長度放大。** 開採週期 2 刻、加工週期 3～6 刻；
 * 若每個配方都只賺相同的每週期毛利，加工因為週期長、每日跑的輪數少，
 * 每日毛利會被稀釋到開採的十分之一（實測 200 vs 1500），
 * 於是「往下游走」永遠是壞選擇。改用 `processingMarginPerCycle(cycleTicks)`
 * 讓每日毛利大致持平，加工才有存在的理由。
 */
export const VALUE_CHAIN = {
  /** 開採配方（週期 2 刻）的每週期毛利基準。 */
  extractMarginPerCycle: 600,
  /**
   * 加工配方的每日毛利目標；每週期毛利 = 此值 × 週期刻數 ÷ 2。
   *
   * **門檻由開採的實際產出決定，不是憑感覺調的。**
   * 開採配方因為 `EXTRACT_OUTPUT_MULTIPLIER = 6`，每週期賣出
   * `6 × 250 = 1,500`（鐵礦），週期 2 刻 → **每刻 1,500**。
   * 加工配方每週期毛利是 `此值 × 週期刻數 ÷ 2`：
   *
   *   - 1,400 時：每週期 2,100（週期 3）→ **每刻 700**，只有開採的一半。
   *     實測 `roll-alloy`（最終產物）每刻 787，仍輸給賣原礦的 1,500，
   *     於是「往下游走」永遠是壞選擇，整條加工鏈形同裝飾。
   *   - 2,000 時：每週期 3,000（週期 3）→ **每刻 1,000**。
   *
   * 加工還必須**值得**才有人做：它要蓋更多廠、吃更長的週期
   * （`roll-alloy` 的完整鏈是 4+4+6 = 14 刻），所以每刻報酬理應高於開採。
   */
  processingMarginPerDay: 2_000,
} as const;

/** 依配方週期長度決定加工配方的每週期目標毛利。 */
export function processingMarginPerCycle(baseCycleTicks: number): number {
  return Math.round((VALUE_CHAIN.processingMarginPerDay * baseCycleTicks) / 2);
}

/** 由投入推導產出單價。 */
export function deriveOutputValue(
  inputs: readonly { readonly unitValue: number; readonly quantity: number }[],
  outputQuantity: number,
  marginPerCycle: number = VALUE_CHAIN.extractMarginPerCycle,
): number {
  const inputValue = inputs.reduce((sum, i) => sum + i.unitValue * i.quantity, 0);
  return Math.round((inputValue + marginPerCycle) / outputQuantity);
}

// 基礎原料（開採產出，無投入）
const V_RAW_ORE = 250;
const V_RESIN = 200;
const V_COAL = 120;
const V_COPPER_ORE = 230;
const V_QUARTZ_GRIT = 180;

// 加工品：逐階由投入推導，毛利依各自的週期長度放大
// （冶煉 4 刻、燒製 3 刻、壓製 3 刻、熔鑄 5 刻；見 recipes.ts）
const V_IRON_INGOT = deriveOutputValue(
  [
    { unitValue: V_RAW_ORE, quantity: 2 },
    { unitValue: V_COAL, quantity: 1 },
  ],
  1,
  processingMarginPerCycle(4),
);
const V_COPPER_INGOT = deriveOutputValue(
  [
    { unitValue: V_COPPER_ORE, quantity: 2 },
    { unitValue: V_COAL, quantity: 1 },
  ],
  1,
  processingMarginPerCycle(4),
);
const V_SILICA = deriveOutputValue(
  [
    { unitValue: V_QUARTZ_GRIT, quantity: 2 },
    { unitValue: V_COAL, quantity: 1 },
  ],
  1,
  processingMarginPerCycle(3),
);
const V_BASIC_PART = deriveOutputValue(
  [
    { unitValue: V_RAW_ORE, quantity: 2 },
    { unitValue: V_RESIN, quantity: 1 },
  ],
  1,
  processingMarginPerCycle(3),
);
const V_ALLOY_PLATE = deriveOutputValue(
  [
    { unitValue: V_RAW_ORE, quantity: 3 },
    { unitValue: V_BASIC_PART, quantity: 1 },
  ],
  1,
  processingMarginPerCycle(5),
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
