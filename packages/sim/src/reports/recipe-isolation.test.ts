import { describe, expect, it } from 'vitest';
import { runFullLoop } from './full-loop.js';
import { ITEMS } from '../production/items.js';
import { RECIPES } from '../production/recipes.js';

/**
 * 新增配方不該改變既有平衡。
 *
 * 這是一個真實踩過的坑：`reserveQtyFor` 為了「保留加工原料」會掃描**全部**
 * 配方，卻沒有檢查產出是否可販售、是否已解鎖、技術階段是否到了。
 *
 * 後果是：只要有人在 `RECIPES` 加一筆「理論上永遠不會被選到」的配方，
 * 它的投入就會被誤認為需要保留 —— 原本要賣的成品被扣住不賣，
 * 量測結果整個跑掉。實測加入一筆被鎖住的配方後：
 * 營收從 157,022 掉到 50,742、淨利從 +94,937 變成 −12,950。
 *
 * 這個 bug 讓我連續三輪的「三階加工」評估全部失真。
 */
describe('新增配方不影響既有平衡', () => {
  const OPTIONS = {
    maxParcels: 6,
    depth: 2 as const,
    extractorCount: 2,
    startingCash: 200_000,
    maxDays: 29,
    config: { stageId: 'stage-11' },
  };

  /** 在執行期塞一筆「有研究鎖、產出不可販售」的配方，測完再移除。 */
  function withInjectedRecipe(run: () => void): void {
    const itemId = 'zz-regression-module';
    const recipeId = 'zz-regression-recipe';
    (ITEMS as unknown as Record<string, unknown>)[itemId] = {
      id: itemId,
      nameZh: '測試用模組',
      tier: 'finished',
      unitValue: 1000,
      sellable: false,
    };
    (RECIPES as unknown as Record<string, unknown>)[recipeId] = {
      id: recipeId,
      nameZh: '測試用配方',
      inputs: [{ itemId: 'alloy-plate', quantity: 2 }],
      outputItemId: itemId,
      outputQuantity: 1,
      outputMultiplier: 1,
      baseCycleTicks: 6,
      travelTickPerDistance: 1,
      stage: 'finish',
      minTechStage: 2,
      sourceKind: null,
      reserveCost: 0,
      buildings: ['assembly-plant'],
      researchId: 'consumer-line',
    };
    try {
      run();
    } finally {
      delete (ITEMS as unknown as Record<string, unknown>)[itemId];
      delete (RECIPES as unknown as Record<string, unknown>)[recipeId];
    }
  }

  it('被鎖住的配方不會改變營收與淨利', () => {
    const before = runFullLoop(OPTIONS);
    let after: ReturnType<typeof runFullLoop> | null = null;
    withInjectedRecipe(() => {
      after = runFullLoop(OPTIONS);
    });
    expect(after).not.toBeNull();
    expect(after!.netProfit).toBeCloseTo(before.netProfit, 6);
    expect(after!.pnl.revenue).toBeCloseTo(before.pnl.revenue, 6);
    expect(after!.craftedValue).toBe(before.craftedValue);
  }, 60_000);

  it('移除配方後結果回到原本的值（證明是配方本身造成的）', () => {
    const before = runFullLoop(OPTIONS);
    withInjectedRecipe(() => {
      runFullLoop(OPTIONS);
    });
    const after = runFullLoop(OPTIONS);
    expect(after.netProfit).toBeCloseTo(before.netProfit, 6);
  }, 60_000);
});
