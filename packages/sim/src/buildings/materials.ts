import type { FactoryTypeId } from './catalog.js';
import {
  addItem,
  getItemQty,
  ITEMS,
  removeItem,
  type ItemId,
  type PlayerStock,
} from '../production/items.js';

/**
 * 建築材料需求 · construction materials
 *
 * 原型《創業王》的 `building.csv` 有 7 種建材：建廠不只要錢，還要**材料**。
 * 本專案原本建廠只看現金（`buildCost`），所以「先做出材料、再擴廠」
 * 這條產業鏈的推力不存在 —— 有錢就能無限長廠。
 *
 * 這裡讓**擴廠**吃材料，但**第一座工坊不吃**：
 *
 * | 建築 | 材料 |
 * | --- | --- |
 * | 小型工坊 | 無（起始就能蓋，避免開局鎖死） |
 * | 組裝廠 | 原礦 ×20 ＋ 基礎零件 ×2 |
 * | 門市 | 基礎零件 ×1 |
 * | 實驗室 | 基礎零件 ×1 ＋ 矽石 ×1 |
 *
 * 這個切分是刻意的：
 * - 起手用現金就能蓋工坊 → 遊戲不會一開始就無解。
 * - 要往「深加工／通路／研發」擴張，就必須先真的把原料做成零件 ——
 *   正好把加工鏈變成**擴張的前提**，而不是可選項。
 */
export interface BuildMaterial {
  readonly itemId: ItemId;
  readonly quantity: number;
}

export const BUILD_MATERIALS: Readonly<Record<FactoryTypeId, readonly BuildMaterial[]>> = {
  workshop: [],
  'assembly-plant': [
    { itemId: 'raw-ore', quantity: 10 },
    { itemId: 'basic-part', quantity: 1 },
  ],
  storefront: [{ itemId: 'basic-part', quantity: 1 }],
  lab: [
    { itemId: 'basic-part', quantity: 1 },
    { itemId: 'silica', quantity: 1 },
  ],
};

/** 缺哪些材料、各缺多少。空陣列表示材料齊備。 */
export function missingBuildMaterials(
  stock: PlayerStock | undefined,
  factoryTypeId: FactoryTypeId,
): BuildMaterial[] {
  const required = BUILD_MATERIALS[factoryTypeId] ?? [];
  const missing: BuildMaterial[] = [];
  for (const material of required) {
    const have = getItemQty(stock ?? {}, material.itemId);
    if (have < material.quantity) {
      missing.push({ itemId: material.itemId, quantity: material.quantity - have });
    }
  }
  return missing;
}

/** 材料是否齊備。 */
export function hasBuildMaterials(
  stock: PlayerStock | undefined,
  factoryTypeId: FactoryTypeId,
): boolean {
  return missingBuildMaterials(stock, factoryTypeId).length === 0;
}

/**
 * 扣掉建廠材料。材料不足時回傳 `null`（呼叫端應先檢查）。
 */
export function consumeBuildMaterials(
  stock: PlayerStock | undefined,
  factoryTypeId: FactoryTypeId,
): PlayerStock | null {
  if (!hasBuildMaterials(stock, factoryTypeId)) {
    return null;
  }
  let next: PlayerStock = { ...(stock ?? {}) };
  for (const material of BUILD_MATERIALS[factoryTypeId] ?? []) {
    const removed = removeItem(next, material.itemId, material.quantity);
    if (!removed) {
      return null;
    }
    next = removed;
  }
  return next;
}

/** 給 UI 用的可讀需求字串，例如「原礦 ×20、基礎零件 ×2」。 */
export function describeBuildMaterials(factoryTypeId: FactoryTypeId): string {
  const required = BUILD_MATERIALS[factoryTypeId] ?? [];
  if (required.length === 0) {
    return '不需材料';
  }
  return required
    .map((material) => `${ITEMS[material.itemId].nameZh} ×${material.quantity}`)
    .join('、');
}

/**
 * 測試與除錯用：把某型建築所需的材料補進庫存。
 *
 * 正式流程不會呼叫這個 —— 它的存在是為了讓「建廠要備料」這件事
 * 在單元測試裡可以只表達一次，而不必每個測試自己湊材料。
 */
export function grantBuildMaterials(
  stock: PlayerStock | undefined,
  factoryTypeId: FactoryTypeId,
): PlayerStock {
  let next: PlayerStock = { ...(stock ?? {}) };
  for (const material of BUILD_MATERIALS[factoryTypeId] ?? []) {
    next = addItem(next, material.itemId, material.quantity);
  }
  return next;
}
