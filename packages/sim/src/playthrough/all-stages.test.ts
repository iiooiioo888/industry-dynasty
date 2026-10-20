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
   * 節奏：通關不該在前 30% 天數就發生，也不該拖過期限。
   *
   * 第 19 回合量到「每關第 2 天就通關」—— 目標照低估 30 倍的 harness 訂。
   * 第 20 回合依 `playStage` 實測重新校準後，第一關是第 9/12 天通關。
   * 這條測試守住那個節奏，避免目標又被調回去。
   */
  it('第一關的通關節奏合理（在期限的 30%–100% 之間）', () => {
    const stage = STAGES[0]!;
    const result = playStage(stage);
    expect(result.status).toBe('won');
    const ratio = result.gameDay / stage.maxDays;
    expect(
      ratio,
      `第一關在第 ${result.gameDay}/${stage.maxDays} 天通關（${(ratio * 100).toFixed(0)}%）`,
    ).toBeGreaterThan(0.3);
    expect(ratio).toBeLessThanOrEqual(1);
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
