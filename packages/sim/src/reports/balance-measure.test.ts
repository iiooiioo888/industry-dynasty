import { describe, expect, it } from 'vitest';
import { DEFAULT_SIMULATION, runDataReport } from './simulate.js';
import { DEFAULT_SCENARIO } from '../sales/scenario.js';
import { DEFAULT_WORLD_CONFIG } from '../world/config.js';
import { BALANCE } from '../balance/targets.js';

/**
 * 機器人模擬器與通關條件的對齊。
 *
 * `reports/simulate.ts` 現在走**真實生產鏈**（排配方 → 推進生產 → 賣給 NPC），
 * 淨利取自 `sales/pnl` 的 `netProfit`，與 `evaluateScenario` 判定通關用的是同一個數字。
 * 先前它用 `FACTORY_BASE_YIELD × 物流係數 × 時間規劃` 的簡化模型，
 * 完全不經過配方、庫存與運費，因此量到的策略排名與實際玩法無關。
 */
describe('模擬器與通關條件的對齊', () => {
  it('模擬器預設參數與實際出貨情境仍不一致（已知落差，但不影響通關判定）', () => {
    expect(DEFAULT_SIMULATION.mapWidth).not.toBe(DEFAULT_WORLD_CONFIG.mapWidth);
    expect(DEFAULT_SIMULATION.mapHeight).not.toBe(DEFAULT_WORLD_CONFIG.mapHeight);
    expect(DEFAULT_SIMULATION.horizon).not.toBe(DEFAULT_SCENARIO.maxDays);
    expect(DEFAULT_SIMULATION.startingCash).not.toBe(DEFAULT_WORLD_CONFIG.startingCash);
    console.log(
      `模擬器 ${DEFAULT_SIMULATION.mapWidth}×${DEFAULT_SIMULATION.mapHeight} / horizon ${DEFAULT_SIMULATION.horizon} / $${DEFAULT_SIMULATION.startingCash}` +
        `  vs  出貨 ${DEFAULT_WORLD_CONFIG.mapWidth}×${DEFAULT_WORLD_CONFIG.mapHeight} / ${DEFAULT_SCENARIO.maxDays} 天 / $${DEFAULT_WORLD_CONFIG.startingCash}`,
    );
  });

  it('診斷：機器人走真實生產鏈後的損益組成', () => {
    const report = runDataReport({
      gameCount: 6,
      horizon: DEFAULT_SCENARIO.maxDays,
      mapWidth: DEFAULT_WORLD_CONFIG.mapWidth,
      mapHeight: DEFAULT_WORLD_CONFIG.mapHeight,
    });
    console.log('\n=== 機器人在真實生產鏈下的表現（16×12, 25 天）===');
    console.log(
      `  勝率 ${(report.winRate * 100).toFixed(1)}%   平均淨利 ${Math.round(report.netProfit.mean)}` +
        `   中位 ${report.netProfit.distribution.median}`,
    );
    console.log('  策略明細：');
    for (const s of report.strategies) {
      console.log(
        `    ${s.label.padEnd(10)} 觀測=${String(s.observations).padStart(3)}` +
          `  平均淨利=${String(Math.round(s.meanNetProfit)).padStart(8)}` +
          `  破產率=${(s.bankruptcyRate * 100).toFixed(0)}%`,
      );
    }
    // 這條只記錄現況，不強制方向 —— 機器人策略是否需要針對真實生產鏈調整
    // 是設計問題，先量出來再決定。
    expect(report.observations).toBeGreaterThan(0);
  });

  it('勝率必須真有區辨力：完全沒有工廠的策略不可能通關', () => {
    const report = runDataReport({ gameCount: 6, horizon: DEFAULT_SCENARIO.maxDays });
    const keys = Object.keys(report);
    expect(keys).toContain('winRate');
    expect(keys).toContain('wonCount');

    console.log(
      `\n=== 模擬器勝率（horizon ${DEFAULT_SCENARIO.maxDays}，門檻 ${DEFAULT_SCENARIO.targetNetProfit}）===`,
    );
    console.log(
      `  winRate=${(report.winRate * 100).toFixed(1)}%  won=${report.wonCount}/${report.observations}`,
    );
    console.log(
      `  淨利 平均=${Math.round(report.netProfit.mean)}  中位=${report.netProfit.distribution.median}`,
    );
    console.log(`  破產率=${(report.bankruptcyRate * 100).toFixed(1)}%`);

    expect(report.winRate).toBeGreaterThanOrEqual(0);
    expect(report.winRate).toBeLessThanOrEqual(1);
    expect(report.wonCount).toBeLessThanOrEqual(report.observations);
    // 勝率與觀測數必須自洽
    expect(report.winRate).toBeCloseTo(report.wonCount / report.observations, 10);
    // 通關門檻就是平衡模組的那一個，不能各處寫死不同值
    expect(DEFAULT_SCENARIO.targetNetProfit).toBe(BALANCE.targetNetProfit);
  });

  it('勝率必須真有區辨力：完全沒有工廠的策略不可能通關', () => {
    // 圈地投機不建廠、沒有產能，只靠拍賣與稅金，因此不可能累積到通關門檻。
    const report = runDataReport({
      gameCount: 4,
      horizon: DEFAULT_SCENARIO.maxDays,
      roster: [{ id: 'spec', name: '圈地投機', strategy: 'speculator' }],
    });
    console.log(
      `\n  純投機勝率=${(report.winRate * 100).toFixed(1)}%  平均淨利=${Math.round(report.netProfit.mean)}`,
    );
    expect(report.winRate).toBe(0);
  });
});
