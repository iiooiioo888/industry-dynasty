import { describe, it } from 'vitest';
import { runFullLoop, runDoNothing } from './full-loop.js';
import { DEFAULT_WORLD_CONFIG } from '../world/config.js';

describe('完整遊戲迴圈量測', () => {
  it('什麼都不做：確認基準線與現金流', () => {
    const r = runDoNothing({});
    console.log('\n=== 對照組：什麼都不做（25 天） ===');
    console.log(`  起始現金 ${DEFAULT_WORLD_CONFIG.startingCash}  期末現金 ${r.finalCash}`);
    console.log(`  淨利 ${r.netProfit}   狀態 ${r.status}   通關門檻 ${r.scenarioTarget}`);
    console.log(`  PnL: ${JSON.stringify(r.pnl)}`);
    console.log(`  無持有土地時不會產生土地稅 → 淨利應為 0`);
  });

  it('單一礦脈工坊：真實生產鏈下的收支', () => {
    const r = runFullLoop({ maxParcels: 1 });
    console.log('\n=== 單一礦脈工坊（25 天，真實生產鏈） ===');
    console.log(`  持有地塊 ${r.ownedParcels}  完工工廠 ${r.completeFactories}`);
    console.log(`  期末現金 ${r.finalCash}   淨利 ${r.netProfit}`);
    console.log(`  狀態 ${r.status}   達到門檻 ${r.reachedTarget}`);
    console.log(`  PnL: ${JSON.stringify(r.pnl, null, 2)}`);
    console.log('  逐日：');
    console.log('    day  cash      revenue   netProfit  factories  status');
    for (const d of r.days) {
      console.log(
        `    ${String(d.day).padStart(3)}  ${String(d.cash).padStart(8)}  ` +
          `${String(d.revenue).padStart(8)}  ${String(d.netProfit).padStart(9)}  ` +
          `${String(d.factories).padStart(9)}  ${d.status}`,
      );
    }
  });

  it('最大礦脈工坊數量：看能否接近通關門檻', () => {
    for (const maxParcels of [1, 2, 4, 8]) {
      const r = runFullLoop({ maxParcels, startingCash: 100_000 });
      console.log(
        `\n  maxParcels=${String(maxParcels).padStart(2)}  地塊=${String(r.ownedParcels).padStart(2)}` +
          `  工廠=${String(r.completeFactories).padStart(2)}  淨利=${String(r.netProfit).padStart(8)}` +
          `  期末現金=${String(r.finalCash).padStart(8)}  狀態=${r.status}  達標=${r.reachedTarget}`,
      );
    }
  });

  it('生產與銷售的每日明細（檢查是否真的有產出）', () => {
    const r = runFullLoop({ maxParcels: 3 });
    console.log('\n=== maxParcels=3 逐日（含庫存） ===');
    console.log('  day  factories  revenue  transport  netProfit');
    let prevRev = 0;
    for (const d of r.days) {
      console.log(
        `  ${String(d.day).padStart(3)}  ${String(d.factories).padStart(9)}  ` +
          `${String(d.revenue).padStart(7)}  (Δ${String(d.revenue - prevRev).padStart(4)})  ${String(d.netProfit).padStart(9)}`,
      );
      prevRev = d.revenue;
    }
    const units = r.pnl.revenue / 250;
    console.log('\n  距離只壓低「每次產出多少」，不再拉長週期');
    console.log(`  開採配方：每週期 12 單位（2 × EXTRACT_OUTPUT_MULTIPLIER 6），週期 2 刻`);
    console.log(
      `  實際淨利 = ${r.netProfit}  營收 = ${r.pnl.revenue}  運費 = ${r.pnl.transportCost}`,
    );
    console.log(`  約當產出（以原礦單價 250 計）= ${units.toFixed(0)} 單位`);
  });
});
