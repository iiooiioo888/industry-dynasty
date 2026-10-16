import { describe, expect, it } from 'vitest';
import { runFullLoop } from './full-loop.js';
import { BALANCE } from '../balance/targets.js';
import { RECIPES } from '../production/recipes.js';
import { ITEMS } from '../production/items.js';

describe('廣度 vs 深度：真實生產鏈下的策略比較', () => {
  it('同樣工廠數下，深度是否比廣度更賺', () => {
    console.log(
      `\n=== 相同工廠數、不同經營深度（${BALANCE.maxDays} 天，起始現金 100,000）===`,
    );
    console.log(
      'parcels'.padStart(8) +
        'depth'.padStart(7) +
        'factories'.padStart(11) +
        'revenue'.padStart(9) +
        'netProfit'.padStart(11) +
        'status'.padStart(8),
    );

    const rows: { parcels: number; depth: 0 | 1 | 2; net: number }[] = [];
    for (const parcels of [4, 6, 8]) {
      for (const depth of [0, 1, 2] as const) {
        const r = runFullLoop({ maxParcels: parcels, depth, startingCash: 100_000 });
        rows.push({ parcels, depth, net: r.netProfit });
        console.log(
          String(parcels).padStart(8) +
            String(depth).padStart(7) +
            String(r.completeFactories).padStart(11) +
            String(r.pnl.revenue).padStart(9) +
            String(r.netProfit).padStart(11) +
            r.status.padStart(8),
        );
      }
    }

    console.log('\n=== 深度是否優於廣度 ===');
    for (const parcels of [4, 6, 8]) {
      const base = rows.find((x) => x.parcels === parcels && x.depth === 0)!.net;
      const d1 = rows.find((x) => x.parcels === parcels && x.depth === 1)!.net;
      const d2 = rows.find((x) => x.parcels === parcels && x.depth === 2)!.net;
      console.log(
        `  ${parcels} 座：廣度 ${String(base).padStart(7)}  深度1 ${String(d1).padStart(7)} (${d1 >= base ? '勝' : '負'})  深度2 ${String(d2).padStart(7)} (${d2 >= base ? '勝' : '負'})`,
      );
    }

    // 護欄一：每一條路線都必須能通關。遊戲不該只有唯一解。
    for (const row of rows) {
      expect(row.net, `parcels=${row.parcels} depth=${row.depth} 應為獲利`).toBeGreaterThan(0);
    }

    // 護欄二：加工配方本身必須是「做了會賺」的，否則深度不可能是策略。
    // （只驗證配方層級，不宣稱深度已優於廣度 —— 見下方註記。）
    for (const r of Object.values(RECIPES)) {
      if (r.inputs.length === 0) continue;
      const outVal =
        ITEMS[r.outputItemId].unitValue * r.outputQuantity * (r.outputMultiplier ?? 1);
      const inVal = r.inputs.reduce((s, i) => s + ITEMS[i.itemId].unitValue * i.quantity, 0);
      expect(outVal - inVal, `${r.id} 加工後應為正毛利`).toBeGreaterThan(0);
    }

    // 已知未完成：目前 harness 的深度路線與廣度得到相同淨利，
    // 代表「加工廠是否真的在生產」尚未被有效驗證（見註記）。
    // 因此這裡**不**斷言 depth 優於 breadth —— 那是還沒被證明的宣稱。
    const depthEverWins = [4, 6, 8].some((p) => {
      const base = rows.find((x) => x.parcels === p && x.depth === 0)!.net;
      return (
        rows.find((x) => x.parcels === p && x.depth === 1)!.net > base ||
        rows.find((x) => x.parcels === p && x.depth === 2)!.net > base
      );
    });
    console.log(
      `\n  加工深度目前${depthEverWins ? '已' : '尚未'}優於純開採 —— ` +
        `${depthEverWins ? '' : 'harness 可能沒有讓加工廠真正運轉，需先修好量測再談平衡'}`,
    );
  });
});
