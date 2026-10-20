import { describe, expect, it } from 'vitest';
import { playStage } from './play-stage.js';
import { STAGES } from '../balance/stages.js';

/**
 * 端到端可玩性：用玩家的動作打一關。
 *
 * 這個測試揭露了一個重要問題（見 `docs/playthrough.md`）：
 * 關卡目標是照 `reports/full-loop.ts` 的產出校準的，但那個 harness 的
 * 供料策略很保守 —— 它每天把原料賣掉、只保留少許緩衝，
 * 所以「可達成的產出」被大幅低估。
 *
 * 一個懂遊戲的玩家（一鐵、一樹脂、一加工）在**兩天內**就超過第一關目標。
 */
describe('端到端可玩性（玩家動作）', () => {
  it('第一關用玩家動作可以通關', () => {
    const stage = STAGES[0]!;
    const result = playStage(stage);
    expect(result.status).toBe('won');
    expect(result.parcels).toBe(stage.recommendedParcels);
    expect(result.crafted).toBeGreaterThan(stage.targets.craftedValue);
    expect(result.profit).toBeGreaterThan(stage.targets.netProfit);
  }, 120_000);

  /**
   * 把「太快通關」固定成測試。
   *
   * 如果哪天關卡目標被重新校準到合理的節奏，這條會失敗 ——
   * 那時應該把它改成「合理天數內通關」，而不是把目標改回去。
   */
  it('第一關目前太快通關（目標偏低，待重新校準）', () => {
    const stage = STAGES[0]!;
    const result = playStage(stage);
    expect(result.status).toBe('won');
    expect(
      result.gameDay,
      `第一關在第 ${result.gameDay} 天就通關了 —— 目標相對實際產能偏低`,
    ).toBeLessThanOrEqual(3);
  }, 120_000);

  it('每一關都能被玩家的動作玩完（不論輸贏）', () => {
    for (const stage of STAGES) {
      const result = playStage(stage);
      expect(['won', 'lost']).toContain(result.status);
      expect(result.gameDay).toBeGreaterThan(0);
      expect(Number.isFinite(result.profit)).toBe(true);
      expect(result.parcels).toBeGreaterThan(0);
    }
  }, 600_000);
});
