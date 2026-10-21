import { describe, expect, it } from 'vitest';
import { runFullLoop } from './full-loop.js';
import { BALANCE } from '../balance/targets.js';
import { DEFAULT_SCENARIO } from '../sales/scenario.js';
import { evaluateScenario, createScenarioState, scenarioProgress } from '../sales/scenario.js';
import { emptyPnL } from '../sales/pnl.js';
import { craftedValue } from '../production/chain.js';
import { ITEMS } from '../production/items.js';

/**
 * 工業化門檻 · industrialization objective
 *
 * ## 為什麼要有第二個通關維度
 *
 * 原型《創業王》的關卡目標是多維度的（`Stages.csv` 的 22 關同時要求
 * 年獲利／資產／現金／清償貸款），不是單一數字。單一淨利門檻的實測後果是：
 * 「買一塊地、蓋一座礦場、挖礦轉賣」就能過關，整條加工鏈可以完全跳過 ——
 * 遊戲在有趣的部分開始前就結束了。
 *
 * 這裡加上「累計加工產值」作為第二維度：純開採恆為 0，因此必然無法通關。
 * 兩個維度不可互相替代：賺再多錢，沒有把原料變成產品，一樣不算贏。
 */
describe('工業化門檻', () => {
  it('純開採的加工產值恆為 0', () => {
    for (const maxParcels of [1, 2, 3, 4, 6, 8]) {
      const r = runFullLoop({ maxParcels, depth: 0, startingCash: 100_000 });
      expect(r.craftedValue, `${maxParcels} 塊地純開採不該有加工產值`).toBe(0);
    }
  });

  it('純開採在任何規模都無法通關，即使淨利很高', () => {
    for (const maxParcels of [1, 2, 3, 4, 6, 8]) {
      const r = runFullLoop({ maxParcels, depth: 0, startingCash: 100_000 });
      expect(r.status, `${maxParcels} 塊地純開採不該通關`).not.toBe('won');
      expect(r.reachedTarget).toBe(false);
    }
    // 對照：8 塊地純開採的淨利其實遠超淨利門檻，證明擋下來的是工業化維度
    const big = runFullLoop({ maxParcels: 8, depth: 0, startingCash: 100_000 });
    expect(big.netProfit).toBeGreaterThan(BALANCE.targetNetProfit);
  });

  it('一階加工從 3 塊地起可以通關', () => {
    for (const maxParcels of [3, 4, 6, 8]) {
      const r = runFullLoop({ maxParcels, depth: 1, startingCash: 100_000 });
      expect(r.craftedValue, `${maxParcels} 塊地一階加工應有產值`).toBeGreaterThan(0);
      expect(r.status, `${maxParcels} 塊地一階加工應通關`).toBe('won');
    }
  });

  it('二階加工的規模門檻高於一階（越深需要越大佈局）', () => {
    const firstWin = (depth: 0 | 1 | 2): number | null => {
      for (const maxParcels of [2, 3, 4, 6, 8]) {
        if (runFullLoop({ maxParcels, depth, startingCash: 100_000 }).status === 'won') {
          return maxParcels;
        }
      }
      return null;
    };
    const shallow = firstWin(1);
    const deep = firstWin(2);
    expect(shallow, '一階必須能通關').not.toBeNull();
    expect(deep, '二階必須能通關').not.toBeNull();
    expect(deep!, '二階的規模門檻應高於一階').toBeGreaterThan(shallow!);
    console.log(`\n  一階最少 ${shallow} 塊地、二階最少 ${deep} 塊地`);
  });

  it('加工產值只計非原料，且以帳面價值累計', () => {
    // 原料不計入
    expect(craftedValue({ 'raw-ore': 100, resin: 50 })).toBe(0);
    // 中間財與成品都計入，用單價加權
    const onePart = ITEMS['basic-part'].unitValue;
    expect(craftedValue({ 'basic-part': 1 })).toBe(onePart);
    expect(craftedValue({ 'basic-part': 2, 'alloy-plate': 1 })).toBe(
      onePart * 2 + ITEMS['alloy-plate'].unitValue,
    );
    // 混合：原料被忽略
    expect(craftedValue({ 'raw-ore': 999, 'basic-part': 1 })).toBe(onePart);
  });

  it('判定邏輯：兩個維度都必須達成', () => {
    const pnl = emptyPnL();
    const scenario = createScenarioState();

    // 只賺錢、沒加工 → 仍然 playing
    const richOnly = evaluateScenario(
      scenario,
      BALANCE.maxDays - 1,
      { ...pnl, revenue: BALANCE.targetNetProfit + 1 },
      { craftedValue: 0 },
    );
    expect(richOnly.status).toBe('playing');

    // 只加工、沒賺錢 → 仍然 playing
    const craftOnly = evaluateScenario(scenario, BALANCE.maxDays - 1, pnl, {
      craftedValue: BALANCE.targetCraftedValue + 1,
    });
    expect(craftOnly.status).toBe('playing');

    // 兩者都達成 → won
    const both = evaluateScenario(
      scenario,
      BALANCE.maxDays - 1,
      { ...pnl, revenue: BALANCE.targetNetProfit + 1 },
      { craftedValue: BALANCE.targetCraftedValue + 1 },
    );
    expect(both.status).toBe('won');

    // 沒達成就到期限 → lost
    const expired = evaluateScenario(scenario, BALANCE.maxDays, pnl, { craftedValue: 0 });
    expect(expired.status).toBe('lost');
  });

  it('商業路線也能通關，但只要營收不足就不算', () => {
    const scenario = createScenarioState();
    const pnl = emptyPnL();
    // 消費營收與佔比都達標 → 不需要加工也能走商業路線
    const commerceWin = evaluateScenario(scenario, BALANCE.maxDays - 1, pnl, {
      craftedValue: 0,
      commerce: { share: 0.2, consumerRevenue: 25_000 },
    });
    expect(commerceWin.status).toBe('won');

    // 只有佔比、營收不足 → 不算
    const shareOnly = evaluateScenario(scenario, BALANCE.maxDays - 1, pnl, {
      craftedValue: 0,
      commerce: { share: 0.9, consumerRevenue: 100 },
    });
    expect(shareOnly.status).toBe('playing');
  });

  it('進度查詢能分辨是哪一個維度沒達成', () => {
    const pnl = { ...emptyPnL(), revenue: BALANCE.targetNetProfit };
    const progress = scenarioProgress(createScenarioState(), pnl, { craftedValue: 0 });
    expect(progress.profitMet).toBe(true);
    expect(progress.craftedMet).toBe(false);
    expect(progress.won).toBe(false);
  });

  it('舊設定缺少 targetCraftedValue 時會退回現行設計值', () => {
    // 模擬「舊存檔只有 targetNetProfit 與 maxDays」
    const legacy = createScenarioState({
      targetNetProfit: 1_000,
      maxDays: 25,
    } as unknown as typeof DEFAULT_SCENARIO);
    expect(legacy.config.targetCraftedValue).toBe(BALANCE.targetCraftedValue);
    expect(legacy.config.targetNetProfit).toBe(1_000);
  });
});
