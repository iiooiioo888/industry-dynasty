import { describe, expect, it } from 'vitest';
import { DEFAULT_SIMULATION, runDataReport } from './simulate.js';
import { DEFAULT_SCENARIO } from '../sales/scenario.js';
import { DEFAULT_WORLD_CONFIG } from '../world/config.js';

/**
 * 平衡量測與護欄。
 *
 * `reports/simulate.ts` 的機器人模擬器與實際遊戲是**兩套不同的收益模型**：
 * 模擬器用 `FACTORY_BASE_YIELD × 物流係數 × 時間規劃`，
 * 實際遊戲走 `production-line` 的配方產出 → NPC 收購 → 運費。
 * 因此模擬器的數字可以描述「拍賣與建廠的競爭結構」，
 * 但不能用來證明玩家過得了關。以下測試把這個落差固定成可被發現的事實。
 */

describe('模擬器與通關條件的參數對齊', () => {
  it('模擬器預設參數與實際出貨情境不一致（已知落差）', () => {
    // 出貨地圖是 16×12；模擬器預設只跑 6×5。
    expect(DEFAULT_SIMULATION.mapWidth).not.toBe(DEFAULT_WORLD_CONFIG.mapWidth);
    expect(DEFAULT_SIMULATION.mapHeight).not.toBe(DEFAULT_WORLD_CONFIG.mapHeight);
    // 通關給 25 天；模擬器 horizon 只跑 18。
    expect(DEFAULT_SIMULATION.horizon).not.toBe(DEFAULT_SCENARIO.maxDays);
    // 起始現金也不同。
    expect(DEFAULT_SIMULATION.startingCash).not.toBe(DEFAULT_WORLD_CONFIG.startingCash);
    console.log(
      `模擬器 ${DEFAULT_SIMULATION.mapWidth}×${DEFAULT_SIMULATION.mapHeight} / horizon ${DEFAULT_SIMULATION.horizon} / $${DEFAULT_SIMULATION.startingCash}` +
        `  vs  出貨 ${DEFAULT_WORLD_CONFIG.mapWidth}×${DEFAULT_WORLD_CONFIG.mapHeight} / ${DEFAULT_SCENARIO.maxDays} 天 / $${DEFAULT_WORLD_CONFIG.startingCash}`,
    );
  });

  it('在出貨地圖尺度下，距離懲罰不再出現死區', () => {
    const small = runDataReport({ gameCount: 4 });
    const shipped = runDataReport({
      gameCount: 4,
      mapWidth: DEFAULT_WORLD_CONFIG.mapWidth,
      mapHeight: DEFAULT_WORLD_CONFIG.mapHeight,
      horizon: DEFAULT_SCENARIO.maxDays,
    });

    // 較大地圖＋較長 horizon 應該讓總淨利上升，否則代表距離成本把地圖優勢吃掉了。
    expect(shipped.netProfit.mean).toBeGreaterThan(small.netProfit.mean);
    expect(shipped.parameters.mapWidth).toBe(DEFAULT_WORLD_CONFIG.mapWidth);
    expect(shipped.parameters.horizon).toBe(DEFAULT_SCENARIO.maxDays);
  });

  it('報告結構不含勝率欄位 —— 模擬器無法回答「玩家能不能過關」', () => {
    const report = runDataReport({ gameCount: 2 });
    const keys = Object.keys(report);
    expect(keys).toContain('netProfit');
    expect(keys).toContain('bankruptcyRate');
    expect(keys).not.toContain('winRate');
    expect(keys).not.toContain('scenario');
    // 通關門檻存在，但報告完全沒有引用它。
    expect(DEFAULT_SCENARIO.targetNetProfit).toBeGreaterThan(0);
  });
});
