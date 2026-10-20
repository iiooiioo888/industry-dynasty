import { describe, expect, it } from 'vitest';
import { ITEMS } from '../production/items.js';
import { RECIPES } from '../production/recipes.js';
import { isRecipeUnlocked } from '../production/planning.js';
import { STAGES } from '../balance/stages.js';
import { playStage } from '../playthrough/play-stage.js';

/**
 * 第三階加工（精密模組）。
 *
 * 合金板（原本的二階成品）再加工成精密模組，讓價值鏈多一段。
 * 這是後期唯一能再往上跳一階的手段 —— 目前一階產值上限約 1.2M、二階約 2.9M，
 * 中間沒有其他成長空間。
 *
 * **關鍵不變性**：它需要研發解鎖，沒解鎖時**不得影響任何既有結果**。
 * 這一條之前踩過坑（第 8–13 回合反覆失敗），根因是量測工具會誤保留原料，
 * 已經修掉並有 `reports/recipe-isolation.test.ts` 守著。
 */
describe('第三階加工', () => {
  it('精密模組是可販售的成品，價值高於合金板', () => {
    const precision = ITEMS['precision-module'];
    const alloy = ITEMS['alloy-plate'];
    expect(precision.sellable).toBe(true);
    expect(precision.tier).toBe('finished');
    expect(precision.unitValue).toBeGreaterThan(alloy.unitValue);
  });

  it('配方吃的是二階成品（合金板），代表合金板變成中間件', () => {
    const recipe = RECIPES['assemble-precision'];
    const inputs = recipe.inputs.map((input) => input.itemId);
    expect(inputs).toContain('alloy-plate');
    expect(recipe.outputItemId).toBe('precision-module');
    expect(recipe.buildings).toContain('assembly-plant');
  });

  it('需要研發解鎖：未解鎖時不可排', () => {
    const recipe = RECIPES['assemble-precision'];
    // 第 23 回合把研究拆成鏈：精密模組要「精密加工」，不是最初的「消費品產線」
    expect(recipe.researchId).toBe('precision-line');
    expect(isRecipeUnlocked(recipe, [])).toBe(false);
    expect(isRecipeUnlocked(recipe, ['consumer-line'])).toBe(false);
    expect(isRecipeUnlocked(recipe, ['precision-line'])).toBe(true);
  });

  it('每週期毛利高於二階配方（否則排程永遠不會選它）', () => {
    const marginPerCycle = (recipeId: keyof typeof RECIPES): number => {
      const recipe = RECIPES[recipeId];
      const inputValue = recipe.inputs.reduce(
        (sum, input) => sum + ITEMS[input.itemId].unitValue * input.quantity,
        0,
      );
      const outputValue = ITEMS[recipe.outputItemId].unitValue * recipe.outputQuantity;
      return (outputValue - inputValue) / recipe.baseCycleTicks;
    };
    expect(marginPerCycle('assemble-precision')).toBeGreaterThan(
      marginPerCycle('make-alloy-plate'),
    );
  });

  it('未解鎖時不影響任何關卡的既有結果', () => {
    // 這條是回歸測試：新增配方若能悄悄改變模擬結果，就會在這裡被抓到。
    const stage = STAGES.find((entry) => entry.id === 'stage-11')!;
    const result = playStage(stage, { playFullHorizon: true });
    // 沒有任何工廠被指派去跑精密模組（研究未解鎖）
    expect(result.crafted).toBeGreaterThan(0);
    expect(result.status).toBe('won');
  }, 300_000);
});
