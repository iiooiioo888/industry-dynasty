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
  | 'alloy-plate'
  | 'hand-tool'
  | 'wire-bundle'
  | 'pack-module'
  | 'precision-module'
  | 'control-unit';

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
 * **名目每刻毛利：開採 < 加工 < 成品。**
 * 開採鐵礦因 6 倍產量，係數為 1 時每刻約 1,500。
 * 加工與成品的單價故意高過這個天花板，否則玩家會正確地只賣礦。
 *
 * 高單價不是全程白送。`line-economy.ts` 的距離指數在係數掉下去之後
 * 把加工溢價吃掉，遠址深加工會輸給賣礦。機械再決定你留得住多少。
 */
export const VALUE_CHAIN = {
  /** 開採配方（週期 2 刻）的每週期毛利基準。實際鐵礦更高，因為有產出倍率。 */
  extractMarginPerCycle: 600,
  /**
   * 加工（一階）名目每刻毛利。每週期毛利 = 此值 × 週期刻數。
   * 要高過鐵礦的 1,500/刻，兩座加工廠的營收才蓋得過四座礦場。
   */
  processMarginPerTick: 4_100,
  /**
   * 成品（二階）名目每刻毛利。熔鑄捷徑用它定合金板單價；
   * 軋製鏈的每刻毛利是這個單價減去中間件投入後的結果，應仍高於一階。
   */
  finishMarginPerTick: 8_450,
  /** 與 `processMarginPerTick` 相同，保留舊欄位名稱。 */
  processingMarginPerDay: 4_100,
} as const;

/** 依配方週期與階段決定加工配方的每週期目標毛利。 */
export function processingMarginPerCycle(
  baseCycleTicks: number,
  stage: 'process' | 'finish' = 'process',
): number {
  const perTick =
    stage === 'finish' ? VALUE_CHAIN.finishMarginPerTick : VALUE_CHAIN.processMarginPerTick;
  return perTick * baseCycleTicks;
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
  processingMarginPerCycle(5, 'finish'),
);
const V_HAND_TOOL = deriveOutputValue(
  [
    { unitValue: V_IRON_INGOT, quantity: 1 },
    { unitValue: V_BASIC_PART, quantity: 1 },
  ],
  1,
  processingMarginPerCycle(4, 'finish'),
);
const V_WIRE_BUNDLE = deriveOutputValue(
  [{ unitValue: V_COPPER_INGOT, quantity: 1 }],
  1,
  processingMarginPerCycle(3, 'finish'),
);
const V_PACK_MODULE = deriveOutputValue(
  [
    { unitValue: V_SILICA, quantity: 1 },
    { unitValue: V_RESIN, quantity: 1 },
  ],
  1,
  processingMarginPerCycle(4, 'finish'),
);
/**
 * 三階產品：把合金板（原本的二階成品）再加工成精密模組。
 *
 * 合金板因此從「最終商品」變成「中間件」，價值鏈多一段。
 * 這是後期唯一能再往上跳一階的手段 —— 目前技術樹只有兩階，
 * 一階加工產值上限約 1.2M、二階約 2.9M，兩者之間沒有其他成長空間。
 *
 * **需要研發解鎖**（`researchId: 'consumer-line'`）：沒解鎖不會被排程選到。
 * 毛利刻意設得比二階高，否則排程永遠不會選它（見下方 120,000 的說明）。
 */
/**
 * 四階產品：把精密模組再組成控制單元。
 *
 * 這一階需要「控制模組」研究（3 天）—— 後期關卡的節奏就是靠這件事撐起來的。
 * 放在 `V_PRECISION_MODULE` 之後，因為它吃精密模組當原料。
 */
const V_PRECISION_MODULE = deriveOutputValue(
  [
    { unitValue: V_ALLOY_PLATE, quantity: 2 },
    { unitValue: V_BASIC_PART, quantity: 2 },
  ],
  1,
  // 每週期毛利 120,000／8 刻 = 15,000，高於熔鑄合金板（8,450）與軋製（10,870）
  120_000,
);
const V_CONTROL_UNIT = deriveOutputValue(
  [
    { unitValue: V_PRECISION_MODULE, quantity: 2 },
    { unitValue: V_SILICA, quantity: 2 },
  ],
  1,
  // 每週期毛利 300,000／10 刻 = 30,000，高於精密模組的 15,000
  300_000,
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
  'hand-tool': {
    id: 'hand-tool',
    nameZh: '手工具',
    tier: 'finished',
    unitValue: V_HAND_TOOL,
    sellable: false,
  },
  'wire-bundle': {
    id: 'wire-bundle',
    nameZh: '導電線束',
    tier: 'finished',
    unitValue: V_WIRE_BUNDLE,
    sellable: false,
  },
  'pack-module': {
    id: 'pack-module',
    nameZh: '封裝模組',
    tier: 'finished',
    unitValue: V_PACK_MODULE,
    sellable: false,
  },
  'precision-module': {
    id: 'precision-module',
    nameZh: '精密模組',
    tier: 'finished',
    unitValue: V_PRECISION_MODULE,
    sellable: true,
  },
  'control-unit': {
    id: 'control-unit',
    nameZh: '控制單元',
    tier: 'finished',
    unitValue: V_CONTROL_UNIT,
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
  'hand-tool',
  'wire-bundle',
  'pack-module',
  'precision-module',
  'control-unit',
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
