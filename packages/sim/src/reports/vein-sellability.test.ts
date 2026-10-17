import { describe, expect, it } from 'vitest';
import { ITEMS } from '../production/items.js';
import { RECIPES } from '../production/recipes.js';
import { runSimulatedGames, resolveSimulationOptions } from './simulate.js';
import { DEFAULT_SCENARIO } from '../sales/scenario.js';
import { DEFAULT_WORLD_CONFIG } from '../world/config.js';

/**
 * 礦脈可販售性：影響地圖上「哪些地值得蓋工廠」。
 *
 * P0 修正試玩死路後，五種開採產出（含煤炭、銅礦、石英砂粒）都可直接收購。
 * 鐵錠、銅錠、矽片仍是中間件。`parcelCanProduce` 只排除產出不可販售的配方。
 */
describe('礦脈與可販售性', () => {
  it('五種開採產出都可販售，中間件仍不可直接賣', () => {
    const extraction = Object.values(RECIPES).filter((r) => r.inputs.length === 0);
    const sellable = extraction.filter((r) => ITEMS[r.outputItemId].sellable);
    const dead = extraction.filter((r) => !ITEMS[r.outputItemId].sellable);

    console.log('\n=== 開採產出的可販售性 ===');
    for (const r of extraction) {
      console.log(
        `  ${r.id.padEnd(16)} ${String(r.sourceKind).padEnd(12)} -> ${ITEMS[r.outputItemId].nameZh.padEnd(6)} sellable=${ITEMS[r.outputItemId].sellable}`,
      );
    }

    // 護欄：P0 銅礦／煤炭／石英死路已打開。改回「只有兩種可賣」會讓試玩再次卡死。
    expect(extraction).toHaveLength(5);
    expect(sellable).toHaveLength(5);
    expect(dead).toHaveLength(0);
    expect(sellable.map((r) => r.sourceKind).sort()).toEqual([
      'coal-seam',
      'copper-shale',
      'iron-vein',
      'quartz-sand',
      'resin-bog',
    ]);
    expect(ITEMS['iron-ingot'].sellable).toBe(false);
    expect(ITEMS['copper-ingot'].sellable).toBe(false);
    expect(ITEMS.silica.sellable).toBe(false);
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

  it('產能反映實際生產，而不是舊的名目產能', () => {
    const games = runSimulatedGames(
      resolveSimulationOptions({
        gameCount: 2,
        seed: 7,
        horizon: DEFAULT_SCENARIO.maxDays,
        mapWidth: DEFAULT_WORLD_CONFIG.mapWidth,
        mapHeight: DEFAULT_WORLD_CONFIG.mapHeight,
      }),
    );
    console.log('\n=== 產能 vs 實際營收 ===');
    const sums = new Map<string, { cap: number; rev: number; fac: number; n: number }>();
    for (const g of games) {
      for (const p of g.players) {
        const s = sums.get(p.strategy) ?? { cap: 0, rev: 0, fac: 0, n: 0 };
        s.cap += p.capacity;
        s.rev += p.revenue;
        s.fac += p.completeFactories;
        s.n += 1;
        sums.set(p.strategy, s);
      }
    }
    for (const [strategy, s] of sums) {
      console.log(
        `  ${strategy.padEnd(16)} capacity=${Math.round(s.cap / s.n)
          .toString()
          .padStart(6)}` +
          `  revenue=${Math.round(s.rev / s.n)
            .toString()
            .padStart(7)}  factories=${(s.fac / s.n).toFixed(1)}`,
      );
    }

    // 護欄：產能必須來自真的在運轉的生產線。
    // 沒有任何生產線時產能應為 0；有工廠且有營收時產能必須 > 0。
    for (const [strategy, s] of sums) {
      const cap = s.cap / s.n;
      const rev = s.rev / s.n;
      const factories = s.fac / s.n;
      if (factories === 0) {
        expect(cap, `${strategy} 沒有工廠，產能應為 0`).toBe(0);
      } else if (rev > 0) {
        expect(cap, `${strategy} 有營收，產能必須大於 0`).toBeGreaterThan(0);
      }
    }
  });
});
