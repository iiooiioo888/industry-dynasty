import type { FactoryTypeId } from '../buildings/catalog.js';
import type { ParcelResourceKind } from '../world/parcel-resources.js';
import type { ItemId } from './items.js';

export type RecipeStage = 'extract' | 'process' | 'finish';

/**
 * 礦脈 → 原料 → 中間件 → 成品
 *
 * 鐵脈 → 原礦 ─┐
 * 煤層 → 煤炭 ─┼→ 鐵錠 ─┐
 * 銅頁岩 → 銅礦 ─→ 銅錠 ┼→ 合金板（礦物鏈）
 * 石英砂 → 石英砂粒 → 矽片 ─┘
 * 樹脂沼 → 樹脂 ─┐
 * 原礦 ─────────┴→ 基礎零件 → 合金板（起始庫存就能走的捷徑，不鎖技術）
 *
 * 煤炭、銅礦、石英砂粒可直接賣給港區。鐵錠、銅錠、矽片要再加工；合金板要組裝廠。
 * 距離只降低產出係數，不拉長生產週期；物流效率仍縮短週期。
 * 出貨路程佔模擬時間，與生產週期分開計算。
 */
export type RecipeId =
  | 'extract-iron'
  | 'extract-resin'
  | 'extract-quartz'
  | 'extract-coal'
  | 'extract-copper'
  | 'make-basic-part'
  | 'smelt-iron'
  | 'smelt-copper'
  | 'fire-silica'
  | 'make-alloy-plate'
  | 'roll-alloy'
  | 'make-hand-tool'
  | 'make-wire-bundle'
  | 'make-pack-module'
  | 'assemble-precision'
  | 'assemble-control'
  | 'pack-tool-kit'
  | 'pack-wire-spool'
  | 'pack-sealant';

export interface RecipeDef {
  readonly id: RecipeId;
  readonly nameZh: string;
  readonly inputs: readonly { readonly itemId: ItemId; readonly quantity: number }[];
  readonly outputItemId: ItemId;
  readonly outputQuantity: number;
  /** 每週期產出倍率；開採類用 EXTRACT_OUTPUT_MULTIPLIER，加工類為 1。 */
  readonly outputMultiplier: number;
  readonly baseCycleTicks: number;
  readonly travelTickPerDistance: number;
  readonly stage: RecipeStage;
  /** 0 隨時可排；1 需入庫 4 單位原料；2 需入庫 2 單位中間件 */
  readonly minTechStage: 0 | 1 | 2;
  /** 開採必須落在此礦脈，並消耗儲量 */
  readonly sourceKind: ParcelResourceKind | null;
  readonly reserveCost: number;
  readonly buildings: readonly FactoryTypeId[];
  /** 有值時，研發室解鎖前不能排產。港區不收購這些產出。 */
  readonly researchId?: string;
}

export const TECH_GATES = {
  processCraftedRaw: 4,
  finishCraftedIntermediate: 2,
} as const;

/**
 * 開採配方的每週期產出倍率。
 *
 * 週期長度含「往返供應樞紐」的距離（`baseCycleTicks + 距離`），
 * 因此距離 8 的地塊每週期要 10 刻。若每週期只產 2 單位，
 * 25 天只有 2.5 單位、約 1,250 價值，連建廠成本 3,000 都收不回來 ——
 * 於是「多蓋工廠」永遠是虧的，數量槓桿完全失效。
 *
 * 開採是**大量低價**的活動，所以提高每週期產出而非單價；
 * 加工配方維持 1～2 單位的高價產出，兩者才有真正的取捨。
 */
export const EXTRACT_OUTPUT_MULTIPLIER = 6;

export const RECIPES = {
  'extract-iron': {
    id: 'extract-iron',
    nameZh: '開採鐵礦',
    inputs: [],
    outputItemId: 'raw-ore',
    outputQuantity: 2,
    outputMultiplier: EXTRACT_OUTPUT_MULTIPLIER,
    baseCycleTicks: 2,
    travelTickPerDistance: 1,
    stage: 'extract',
    minTechStage: 0,
    sourceKind: 'iron-vein',
    reserveCost: 1,
    buildings: ['workshop', 'assembly-plant'],
  },
  'extract-resin': {
    id: 'extract-resin',
    nameZh: '採集樹脂',
    inputs: [],
    outputItemId: 'resin',
    outputQuantity: 2,
    outputMultiplier: EXTRACT_OUTPUT_MULTIPLIER,
    baseCycleTicks: 2,
    travelTickPerDistance: 1,
    stage: 'extract',
    minTechStage: 0,
    sourceKind: 'resin-bog',
    reserveCost: 1,
    buildings: ['workshop', 'assembly-plant'],
  },
  'extract-quartz': {
    id: 'extract-quartz',
    nameZh: '開採石英砂',
    inputs: [],
    outputItemId: 'quartz-grit',
    outputQuantity: 2,
    outputMultiplier: EXTRACT_OUTPUT_MULTIPLIER,
    baseCycleTicks: 2,
    travelTickPerDistance: 1,
    stage: 'extract',
    minTechStage: 0,
    sourceKind: 'quartz-sand',
    reserveCost: 1,
    buildings: ['workshop', 'assembly-plant'],
  },
  'extract-coal': {
    id: 'extract-coal',
    nameZh: '開採煤炭',
    inputs: [],
    outputItemId: 'coal',
    outputQuantity: 2,
    outputMultiplier: EXTRACT_OUTPUT_MULTIPLIER,
    baseCycleTicks: 2,
    travelTickPerDistance: 1,
    stage: 'extract',
    minTechStage: 0,
    sourceKind: 'coal-seam',
    reserveCost: 1,
    buildings: ['workshop', 'assembly-plant'],
  },
  'extract-copper': {
    id: 'extract-copper',
    nameZh: '開採銅礦',
    inputs: [],
    outputItemId: 'copper-ore',
    outputQuantity: 2,
    outputMultiplier: EXTRACT_OUTPUT_MULTIPLIER,
    baseCycleTicks: 2,
    travelTickPerDistance: 1,
    stage: 'extract',
    minTechStage: 0,
    sourceKind: 'copper-shale',
    reserveCost: 1,
    buildings: ['workshop', 'assembly-plant'],
  },
  'make-basic-part': {
    id: 'make-basic-part',
    nameZh: '壓製基礎零件',
    inputs: [
      { itemId: 'raw-ore', quantity: 2 },
      { itemId: 'resin', quantity: 1 },
    ],
    outputItemId: 'basic-part',
    outputQuantity: 1,
    outputMultiplier: 1,
    baseCycleTicks: 3,
    travelTickPerDistance: 1,
    stage: 'process',
    minTechStage: 0,
    sourceKind: null,
    reserveCost: 0,
    buildings: ['workshop'],
  },
  'smelt-iron': {
    id: 'smelt-iron',
    nameZh: '冶煉鐵錠',
    inputs: [
      { itemId: 'raw-ore', quantity: 2 },
      { itemId: 'coal', quantity: 1 },
    ],
    outputItemId: 'iron-ingot',
    outputQuantity: 1,
    outputMultiplier: 1,
    baseCycleTicks: 4,
    travelTickPerDistance: 1,
    stage: 'process',
    minTechStage: 1,
    sourceKind: null,
    reserveCost: 0,
    buildings: ['workshop'],
  },
  'smelt-copper': {
    id: 'smelt-copper',
    nameZh: '冶煉銅錠',
    inputs: [
      { itemId: 'copper-ore', quantity: 2 },
      { itemId: 'coal', quantity: 1 },
    ],
    outputItemId: 'copper-ingot',
    outputQuantity: 1,
    outputMultiplier: 1,
    baseCycleTicks: 4,
    travelTickPerDistance: 1,
    stage: 'process',
    minTechStage: 1,
    sourceKind: null,
    reserveCost: 0,
    buildings: ['workshop'],
  },
  'fire-silica': {
    id: 'fire-silica',
    nameZh: '燒製矽片',
    inputs: [
      { itemId: 'quartz-grit', quantity: 2 },
      { itemId: 'coal', quantity: 1 },
    ],
    outputItemId: 'silica',
    outputQuantity: 1,
    outputMultiplier: 1,
    baseCycleTicks: 3,
    travelTickPerDistance: 1,
    stage: 'process',
    minTechStage: 1,
    sourceKind: null,
    reserveCost: 0,
    buildings: ['workshop'],
  },
  'make-alloy-plate': {
    id: 'make-alloy-plate',
    nameZh: '熔鑄合金板',
    inputs: [
      { itemId: 'raw-ore', quantity: 3 },
      { itemId: 'basic-part', quantity: 1 },
    ],
    outputItemId: 'alloy-plate',
    outputQuantity: 1,
    outputMultiplier: 1,
    baseCycleTicks: 5,
    travelTickPerDistance: 1,
    stage: 'finish',
    minTechStage: 0,
    sourceKind: null,
    reserveCost: 0,
    buildings: ['assembly-plant'],
  },
  'roll-alloy': {
    id: 'roll-alloy',
    nameZh: '軋製礦物合金板',
    inputs: [
      { itemId: 'iron-ingot', quantity: 1 },
      { itemId: 'copper-ingot', quantity: 1 },
      { itemId: 'silica', quantity: 1 },
    ],
    outputItemId: 'alloy-plate',
    outputQuantity: 2,
    outputMultiplier: 1,
    baseCycleTicks: 6,
    travelTickPerDistance: 1,
    stage: 'finish',
    minTechStage: 2,
    sourceKind: null,
    reserveCost: 0,
    buildings: ['assembly-plant'],
  },
  'make-hand-tool': {
    id: 'make-hand-tool',
    nameZh: '組裝手工具',
    inputs: [
      { itemId: 'iron-ingot', quantity: 1 },
      { itemId: 'basic-part', quantity: 1 },
    ],
    outputItemId: 'hand-tool',
    outputQuantity: 1,
    outputMultiplier: 1,
    baseCycleTicks: 4,
    travelTickPerDistance: 1,
    stage: 'finish',
    minTechStage: 2,
    sourceKind: null,
    reserveCost: 0,
    buildings: ['assembly-plant'],
    researchId: 'consumer-line',
  },
  'make-wire-bundle': {
    id: 'make-wire-bundle',
    nameZh: '絞製導電線束',
    inputs: [{ itemId: 'copper-ingot', quantity: 1 }],
    outputItemId: 'wire-bundle',
    outputQuantity: 1,
    outputMultiplier: 1,
    baseCycleTicks: 3,
    travelTickPerDistance: 1,
    stage: 'finish',
    minTechStage: 2,
    sourceKind: null,
    reserveCost: 0,
    buildings: ['assembly-plant'],
    researchId: 'consumer-line',
  },
  'make-pack-module': {
    id: 'make-pack-module',
    nameZh: '封裝模組',
    inputs: [
      { itemId: 'silica', quantity: 1 },
      { itemId: 'resin', quantity: 1 },
    ],
    outputItemId: 'pack-module',
    outputQuantity: 1,
    outputMultiplier: 1,
    baseCycleTicks: 4,
    travelTickPerDistance: 1,
    stage: 'finish',
    minTechStage: 2,
    sourceKind: null,
    reserveCost: 0,
    buildings: ['assembly-plant'],
    researchId: 'consumer-line',
  },
  'assemble-precision': {
    id: 'assemble-precision',
    nameZh: '組裝精密模組',
    // 第三階：拿二階成品（合金板）再加工，合金板因此變成中間件。
    // 需要研發解鎖 —— 沒解鎖就不會被自動排程選到。
    inputs: [
      { itemId: 'alloy-plate', quantity: 2 },
      { itemId: 'basic-part', quantity: 2 },
    ],
    outputItemId: 'precision-module',
    outputQuantity: 1,
    outputMultiplier: 1,
    baseCycleTicks: 8,
    travelTickPerDistance: 1,
    stage: 'finish',
    minTechStage: 2,
    sourceKind: null,
    reserveCost: 0,
    buildings: ['assembly-plant'],
    researchId: 'precision-line',
  },
  'assemble-control': {
    id: 'assemble-control',
    nameZh: '組裝控制單元',
    // 第四階：精密模組再加工。需要 3 天的「控制模組」研究 ——
    // 後期關卡的節奏就是靠這件事撐起來的，不是靠調目標數字。
    inputs: [
      { itemId: 'precision-module', quantity: 2 },
      { itemId: 'silica', quantity: 2 },
    ],
    outputItemId: 'control-unit',
    outputQuantity: 1,
    outputMultiplier: 1,
    baseCycleTicks: 10,
    travelTickPerDistance: 1,
    stage: 'finish',
    minTechStage: 2,
    sourceKind: null,
    reserveCost: 0,
    buildings: ['assembly-plant'],
    researchId: 'control-line',
  },
  'pack-tool-kit': {
    id: 'pack-tool-kit',
    nameZh: '組裝手持工具組',
    inputs: [
      { itemId: 'basic-part', quantity: 1 },
      { itemId: 'iron-ingot', quantity: 1 },
    ],
    outputItemId: 'tool-kit',
    outputQuantity: 1,
    outputMultiplier: 1,
    baseCycleTicks: 4,
    travelTickPerDistance: 1,
    stage: 'finish',
    minTechStage: 0,
    sourceKind: null,
    reserveCost: 0,
    buildings: ['workshop', 'assembly-plant'],
    researchId: 'civic-tools',
  },
  'pack-wire-spool': {
    id: 'pack-wire-spool',
    nameZh: '捲製導電線捲',
    inputs: [{ itemId: 'copper-ingot', quantity: 2 }],
    outputItemId: 'wire-spool',
    outputQuantity: 1,
    outputMultiplier: 1,
    baseCycleTicks: 3,
    travelTickPerDistance: 1,
    stage: 'finish',
    minTechStage: 0,
    sourceKind: null,
    reserveCost: 0,
    buildings: ['workshop', 'assembly-plant'],
    researchId: 'civic-wire',
  },
  'pack-sealant': {
    id: 'pack-sealant',
    nameZh: '調配密封塗料',
    inputs: [
      { itemId: 'resin', quantity: 2 },
      { itemId: 'silica', quantity: 1 },
    ],
    outputItemId: 'sealant-coat',
    outputQuantity: 1,
    outputMultiplier: 1,
    baseCycleTicks: 3,
    travelTickPerDistance: 1,
    stage: 'finish',
    minTechStage: 0,
    sourceKind: null,
    reserveCost: 0,
    buildings: ['workshop', 'assembly-plant'],
    researchId: 'civic-seal',
  },
} as const satisfies Record<RecipeId, RecipeDef>;

export const RECIPE_LIST: readonly RecipeDef[] = [
  RECIPES['extract-iron'],
  RECIPES['extract-copper'],
  RECIPES['extract-resin'],
  RECIPES['extract-quartz'],
  RECIPES['extract-coal'],
  RECIPES['make-basic-part'],
  RECIPES['smelt-iron'],
  RECIPES['smelt-copper'],
  RECIPES['fire-silica'],
  RECIPES['make-alloy-plate'],
  RECIPES['roll-alloy'],
  RECIPES['make-hand-tool'],
  RECIPES['make-wire-bundle'],
  RECIPES['make-pack-module'],
  RECIPES['assemble-precision'],
  RECIPES['assemble-control'],
  RECIPES['pack-tool-kit'],
  RECIPES['pack-wire-spool'],
  RECIPES['pack-sealant'],
];

export const CHAIN_STAGES = [
  { stage: 0, id: 'extract', nameZh: '開採' },
  { stage: 1, id: 'process', nameZh: '加工' },
  { stage: 2, id: 'finish', nameZh: '成品' },
] as const;
