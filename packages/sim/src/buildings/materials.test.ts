import { describe, expect, it } from 'vitest';
import {
  BUILD_MATERIALS,
  consumeBuildMaterials,
  describeBuildMaterials,
  grantBuildMaterials,
  hasBuildMaterials,
  missingBuildMaterials,
} from './materials.js';
import { FACTORY_TYPES, type FactoryTypeId } from './catalog.js';
import { getItemQty, ITEMS } from '../production/items.js';
import { applyWorldAction } from '../world/reducer.js';
import { createInitialWorld } from '../world/create-world.js';
import { findOpenLotForParcel } from '../world/state.js';

const ALL_TYPES: FactoryTypeId[] = ['workshop', 'assembly-plant', 'storefront', 'lab'];

/**
 * 建築材料需求。
 *
 * 原型《創業王》的 `building.csv` 有 7 種建材：建廠不只要錢，還要材料。
 * 本專案原本建廠只看現金，所以「先做材料、再擴廠」這條推力不存在。
 */
describe('建築材料需求', () => {
  it('工坊免材料 —— 開局不會被鎖死', () => {
    expect(BUILD_MATERIALS.workshop).toHaveLength(0);
    expect(hasBuildMaterials({}, 'workshop')).toBe(true);
    expect(consumeBuildMaterials({}, 'workshop')).toEqual({});
  });

  it('其餘建築都要材料', () => {
    for (const type of ['assembly-plant', 'storefront', 'lab'] as const) {
      expect(BUILD_MATERIALS[type].length).toBeGreaterThan(0);
      expect(hasBuildMaterials({}, type)).toBe(false);
    }
  });

  it('缺料時回報各缺多少', () => {
    const missing = missingBuildMaterials({ 'basic-part': 0 }, 'assembly-plant');
    const required = BUILD_MATERIALS['assembly-plant'];
    expect(missing).toHaveLength(required.length);
    for (const entry of missing) {
      expect(entry.quantity).toBeGreaterThan(0);
    }
  });

  it('材料齊備時 consomme 會扣掉，且不超扣', () => {
    const stock = grantBuildMaterials({}, 'assembly-plant');
    const after = consumeBuildMaterials(stock, 'assembly-plant')!;
    for (const material of BUILD_MATERIALS['assembly-plant']) {
      expect(getItemQty(after, material.itemId)).toBe(
        getItemQty(stock, material.itemId) - material.quantity,
      );
      expect(getItemQty(after, material.itemId)).toBeGreaterThanOrEqual(0);
    }
  });

  it('材料不足時回傳 null，不會半扣', () => {
    const partial = { 'raw-ore': 5 };
    expect(consumeBuildMaterials(partial, 'assembly-plant')).toBeNull();
    // 原物件不被改動
    expect(partial).toEqual({ 'raw-ore': 5 });
  });

  it('grantBuildMaterials 補齊後即可建', () => {
    for (const type of ALL_TYPES) {
      const stock = grantBuildMaterials({}, type);
      expect(hasBuildMaterials(stock, type), `${type} 應該可建`).toBe(true);
    }
  });

  it('需求描述可讀，且會列出所有材料', () => {
    for (const type of ALL_TYPES) {
      const text = describeBuildMaterials(type);
      expect(text.length).toBeGreaterThan(0);
      for (const material of BUILD_MATERIALS[type]) {
        expect(text).toContain(ITEMS[material.itemId].nameZh);
      }
    }
    expect(describeBuildMaterials('workshop')).toContain('不需材料');
  });

  it('實際建廠：缺料會被擋下，補齊後才蓋得起來', () => {
    let state = createInitialWorld({ startingCash: 400_000 });
    const parcel = state.map.parcels
      .filter((p) => p.role === 'land' && p.ownerId === null)
      .find((p) => findOpenLotForParcel(state, p.id) !== undefined)!;
    const lot = findOpenLotForParcel(state, parcel.id)!;
    state = applyWorldAction(state, { type: 'BID', parcelId: parcel.id, amount: lot.minPrice });
    state = applyWorldAction(state, { type: 'SETTLE_AUCTION', parcelId: parcel.id });

    // 缺料 → 狀態不變（建案被擋）
    const blocked = applyWorldAction(state, {
      type: 'START_BUILD',
      parcelId: parcel.id,
      factoryTypeId: 'storefront',
    });
    expect(blocked).toBe(state);
    expect(blocked.sites[parcel.id.value]).toBeUndefined();

    // 補料 → 可以建，且材料被扣掉
    const stocked = {
      ...state,
      inventories: {
        ...state.inventories,
        [state.localPlayerId]: grantBuildMaterials(
          state.inventories[state.localPlayerId],
          'storefront',
        ),
      },
    };
    const before = getItemQty(stocked.inventories[state.localPlayerId], 'basic-part');
    const built = applyWorldAction(stocked, {
      type: 'START_BUILD',
      parcelId: parcel.id,
      factoryTypeId: 'storefront',
    });
    expect(built.sites[parcel.id.value]?.factoryTypeId).toBe('storefront');
    const after = getItemQty(built.inventories[state.localPlayerId], 'basic-part');
    expect(after).toBe(before - (BUILD_MATERIALS.storefront[0]?.quantity ?? 0));
  });

  it('每個廠型的需求都指向真實存在的品項', () => {
    for (const type of ALL_TYPES) {
      for (const material of BUILD_MATERIALS[type]) {
        expect(ITEMS[material.itemId], `${type} 的材料不存在`).toBeDefined();
        expect(material.quantity).toBeGreaterThan(0);
      }
      expect(FACTORY_TYPES[type]).toBeDefined();
    }
  });
});
