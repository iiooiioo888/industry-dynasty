import { describe, expect, it } from 'vitest';
import { ITEMS } from '../production/items.js';
import { RECIPES } from '../production/recipes.js';
import { runSimulatedGames, resolveSimulationOptions } from './simulate.js';
import { DEFAULT_SCENARIO } from '../sales/scenario.js';
import { DEFAULT_WORLD_CONFIG } from '../world/config.js';

/**
 * 礦脈可販售性：影響地圖上「哪些地值得蓋工廠」。
 *
 * 五種礦脈中只有**鐵脈**（原礦）與**樹脂沼**（樹脂）的開採產出可販售。
 * 煤、銅、石英砂粒的產出都不可販售，必須再加工才有價值 ——
 * 但加工需要另一條供應鏈。若把只會開採的工廠蓋在那些礦脈上，
 * 它會一直生產卻一毛錢都換不到，只持續付土地稅與維護費。
 *
 * 這正是機器人策略先前大幅虧損的原因（實測 `rapid-assembly`
 * 兩座工廠營收恰為 0），因此 `parcelCanProduce` 會排除這類地塊。
 */
describe('礦脈與可販售性', () => {
  it('只有部分開採產出可販售', () => {
    const extraction = Object.values(RECIPES).filter((r) => r.inputs.length === 0);
    const sellable = extraction.filter((r) => ITEMS[r.outputItemId].sellable);
    const dead = extraction.filter((r) => !ITEMS[r.outputItemId].sellable);

    console.log('\n=== 開採產出的可販售性 ===');
    for (const r of extraction) {
      console.log(
        `  ${r.id.padEnd(16)} ${String(r.sourceKind).padEnd(12)} -> ${ITEMS[r.outputItemId].nameZh.padEnd(6)} sellable=${ITEMS[r.outputItemId].sellable}`,
      );
    }

    // 護欄：這個比例是地圖設計的重要參數，改變它會大幅影響可建地數量
    expect(extraction).toHaveLength(5);
    expect(sellable).toHaveLength(2);
    expect(dead).toHaveLength(3);
    expect(sellable.map((r) => r.sourceKind).sort()).toEqual(['iron-vein', 'resin-bog']);
  });

  it('機器人不再把工廠蓋在無法販售的礦脈上', () => {
    const games = runSimulatedGames(
      resolveSimulationOptions({
        gameCount: 3,
        seed: 7,
        horizon: DEFAULT_SCENARIO.maxDays,
        mapWidth: DEFAULT_WORLD_CONFIG.mapWidth,
        mapHeight: DEFAULT_WORLD_CONFIG.mapHeight,
      }),
    );

    console.log('\n=== 各策略每座工廠創造的營收 ===');
    const sums = new Map<string, { rev: number; fac: number; n: number }>();
    for (const g of games) {
      for (const p of g.players) {
        const s = sums.get(p.strategy) ?? { rev: 0, fac: 0, n: 0 };
        s.rev += p.revenue;
        s.fac += p.completeFactories;
        s.n += 1;
        sums.set(p.strategy, s);
      }
    }
    for (const [strategy, s] of sums) {
      const fac = s.fac / s.n;
      const rev = s.rev / s.n;
      console.log(
        `  ${strategy.padEnd(16)} factories=${fac.toFixed(1).padStart(4)}  revenue=${String(Math.round(rev)).padStart(7)}` +
          `  rev/factory=${fac > 0 ? Math.round(rev / fac) : 'n/a'}`,
      );
    }

    // 護欄：有工廠的策略必須真的換到收入。若某策略有工廠卻營收為 0，
    // 代表它又把工廠蓋在無法販售的礦脈上了。
    for (const [strategy, s] of sums) {
      const fac = s.fac / s.n;
      const rev = s.rev / s.n;
      if (fac >= 1) {
        expect(rev, `${strategy} 有 ${fac.toFixed(1)} 座工廠卻沒有營收`).toBeGreaterThan(0);
      }
    }
  });
});
