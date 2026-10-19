import { describe, expect, it } from 'vitest';
import { runFullLoop } from './full-loop.js';
import { BALANCE } from '../balance/targets.js';
import { RECIPES } from '../production/recipes.js';
import { ITEMS } from '../production/items.js';

/**
 * 深度 vs 廣度的**公平**比較。
 *
 * 前一版只看 25 天總淨利，得到 depth 0/1/2 完全相同 —— 那是量測失效，
 * 因為加工廠要先用開採廠餵料、又要等建廠完成，在 25 刻內還沒攤平。
 *
 * 真正該問的問題是：**達到同一獲利水準，需要多少塊地？**
 * 地塊是這個遊戲最稀缺的資源（拍賣競價、每塊地都要繳稅），
 * 如果加工能用更少的地達到同樣淨利，深度就是有效策略軸。
 */
describe('深度 vs 廣度：達到通關門檻所需的土地', () => {
  it('掃描不同地塊數下各深度的淨利與達標情形', () => {
    console.log(
      `\n=== 通關門檻 ${BALANCE.targetNetProfit}（${BALANCE.maxDays} 天，起始現金 100,000）===`,
    );
    console.log(
      'parcels'.padStart(8) +
        'depth'.padStart(7) +
        'revenue'.padStart(9) +
        'netProfit'.padStart(11) +
        'status'.padStart(8) +
        '  won?',
    );

    type Cell = {
      net: number;
      status: string;
      revenue: number;
      won: boolean;
      crafted: number;
    };
    const grid = new Map<string, Cell>();
    for (const parcels of [2, 3, 4, 6, 8]) {
      for (const depth of [0, 1, 2] as const) {
        // 公平比較：加工路線也必須有足夠礦場供料。
        // 固定 2 座礦場卻讓加工廠一路增加到 6 座，只會量到「供應鏈被拉爆」，
        // 而不是「加工本身划不划算」。維持約一半礦場、一半加工。
        const extractorCount = depth === 0 ? 1 : Math.max(2, Math.floor(parcels / 2));
        const r = runFullLoop({
          maxParcels: parcels,
          depth,
          extractorCount,
          startingCash: 100_000,
        });
        grid.set(`${parcels}/${depth}`, {
          net: r.netProfit,
          status: r.status,
          revenue: r.pnl.revenue,
          won: r.reachedTarget,
          crafted: r.craftedValue,
        });
        console.log(
          String(parcels).padStart(8) +
            String(depth).padStart(7) +
            String(extractorCount).padStart(10) +
            String(r.pnl.revenue).padStart(9) +
            String(r.netProfit).padStart(11) +
            r.status.padStart(8) +
            (r.reachedTarget ? '  YES' : '  no'),
        );
      }
    }

    console.log('\n=== 各深度「最少需要幾塊地」才能**通關**（淨利＋加工產值雙目標）===');
    const minParcels: Record<number, number | null> = {};
    for (const depth of [0, 1, 2]) {
      let found: number | null = null;
      for (const parcels of [2, 3, 4, 6, 8]) {
        if (grid.get(`${parcels}/${depth}`)!.won) {
          found = parcels;
          break;
        }
      }
      minParcels[depth] = found;
      console.log(
        `  depth=${depth} → ${found === null ? '在 ≤8 塊地內無法通關' : `${found} 塊地`}`,
      );
    }

    // 護欄一：純開採**不得**通關 —— 加工產值恆為 0，這是刻意的設計。
    // 通關必須真的把原料變成產品（見 `balance/targets.ts` 的 targetCraftedValue）。
    expect(minParcels[0], '純開採不該有任何規模能通關').toBeNull();

    // 護欄二：加工路線必須各自有能通關的配置（一階從 3 塊地起、二階需要規模）
    expect(minParcels[1], '一階加工必須至少有一種配置能通關').not.toBeNull();
    expect(minParcels[2], '二階加工必須至少有一種配置能通關').not.toBeNull();

    // 護欄二：每一條路線的最佳配置都必須獲利
    for (const depth of [0, 1, 2]) {
      const best = Math.max(...[2, 3, 4, 6, 8].map((p) => grid.get(`${p}/${depth}`)!.net));
      expect(best, `depth=${depth} 最佳配置應為獲利`).toBeGreaterThan(0);
    }

    // 護欄三：加工配方本身必須是「做了會賺」的
    for (const r of Object.values(RECIPES)) {
      if (r.inputs.length === 0) continue;
      const outVal = ITEMS[r.outputItemId].unitValue * r.outputQuantity * (r.outputMultiplier ?? 1);
      const inVal = r.inputs.reduce((s, i) => s + ITEMS[i.itemId].unitValue * i.quantity, 0);
      expect(outVal - inVal, `${r.id} 加工後應為正毛利`).toBeGreaterThan(0);
    }

    console.log('\n=== 深度是否在任一規模下勝過廣度 ===');
    for (const parcels of [2, 3, 4, 6, 8]) {
      const base = grid.get(`${parcels}/0`)!.net;
      const d1 = grid.get(`${parcels}/1`)!.net;
      const d2 = grid.get(`${parcels}/2`)!.net;
      console.log(
        `  ${parcels} 塊地：廣度 ${String(base).padStart(7)}  深度1 ${String(d1).padStart(7)} ${d1 > base ? '勝' : '  '}  深度2 ${String(d2).padStart(7)} ${d2 > base ? '勝' : '  '}`,
      );
    }

    // 護欄四：新契約是「廣度賺得多，但贏不了；深度才通關」。
    //
    // 舊契約要求「加工淨利必須高於純開採」，但那是把兩個不同的東西混在一起：
    // 純開採的毛利的確最高（原料單價 × 6 倍產出倍率），卻**永遠無法通關**，
    // 因為加工產值恆為 0。所以正確的不變量不是淨利高低，而是：
    //   1. 純開採在**任何**規模都不得通關（已由護欄一保證）
    //   2. 至少要有一種加工配置真的通關
    //   3. 純開採的淨利必須仍然可觀，否則「先挖礦累積資本再轉型」這條路會消失
    const miningBest = Math.max(...[2, 3, 4, 6, 8].map((p) => grid.get(`${p}/0`)!.net));
    const depthWinsSomewhere = [1, 2].some((depth) =>
      [2, 3, 4, 6, 8].some((p) => grid.get(`${p}/${depth}`)!.won),
    );
    const depthWinsMost = [2, 3, 4, 6, 8].filter(
      (p) => grid.get(`${p}/1`)!.won || grid.get(`${p}/2`)!.won,
    );
    console.log(
      `\n  純開採最佳淨利 ${miningBest.toLocaleString()}（但永不通關）` +
        `\n  加工可通關的規模：${depthWinsMost.join(', ')} 塊地`,
    );

    expect(depthWinsSomewhere, '加工必須真的能通關').toBe(true);
    expect(depthWinsMost.length, '加工應該在多種規模下都能通關').toBeGreaterThan(1);
    // 純開採仍必須是可行的「累積資本」路線，只是不構成勝利
    expect(miningBest, '純開採仍應能累積可觀資本').toBeGreaterThan(BALANCE.targetNetProfit);

    // 護欄五：二階加工的規模門檻必須比一階高 —— 越深的產業鏈需要越大佈局，
    // 否則「先做一階、站穩後再往下走」這條成長曲線就不存在。
    expect(minParcels[2]!, '二階的規模門檻應高於一階').toBeGreaterThan(minParcels[1]!);
  });
});
