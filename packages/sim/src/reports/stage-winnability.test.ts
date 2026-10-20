import { describe, expect, it } from 'vitest';
import { STAGES } from '../balance/stages.js';
import { playStage } from '../playthrough/play-stage.js';

/**
 * 關卡可通關性護欄（第 20 回合重寫）。
 *
 * ## 為什麼換量尺
 *
 * 原本用 `reports/full-loop.ts` 驗證。但第 19 回合的端到端驗證發現：
 * 那個 harness **嚴重低估產能** —— 它每天把原料賣掉、只留少量緩衝，
 * 加工廠常常在等料。實測第一關：
 *
 * | 量測方式 | 加工產值 |
 * | --- | --- |
 * | `full-loop` harness | 39,000 |
 * | 玩家動作 | 1,209,000 |
 *
 * 差了 30 倍。目標照 harness 訂，結果就是「兩天速通」。
 *
 * 所以護欄改用 `playStage()` —— 它只用玩家真的能做的動作，
 * 和 UI 走同一條路徑。
 */
describe('關卡可通關性（玩家動作）', () => {
  it('每一關在建議規模下，玩家動作可以通關', () => {
    const failures: string[] = [];
    for (const stage of STAGES) {
      const result = playStage(stage);
      if (result.status !== 'won') {
        failures.push(
          `${stage.id}（${stage.recommendedParcels} 塊地／深度 ${stage.recommendedDepth}，` +
            `淨利 ${result.profit}/${stage.targets.netProfit}、加工 ${result.crafted}/${stage.targets.craftedValue}）`,
        );
      }
    }
    expect(failures, `以下關卡打不過：\n${failures.join('\n')}`).toHaveLength(0);
  }, 600_000);

  it('通關餘裕不會薄到只剩運氣（至少 5%）', () => {
    // 注意：這裡要**打滿天數**再比。
    // `playStage` 預設在通關那一刻停下來，量到的「餘裕」只是壓線時的超額，
    // 不代表玩家真的有多少空間。
    const tooTight: string[] = [];
    for (const stage of STAGES) {
      const result = playStage(stage, { playFullHorizon: true });
      const profitMargin = (result.profit - stage.targets.netProfit) / stage.targets.netProfit;
      const craftedMargin =
        (result.crafted - stage.targets.craftedValue) / stage.targets.craftedValue;
      if (profitMargin < 0.05 || craftedMargin < 0.05) {
        tooTight.push(
          `${stage.id}（淨利 ${(profitMargin * 100).toFixed(1)}%、加工 ${(craftedMargin * 100).toFixed(1)}%）`,
        );
      }
    }
    expect(tooTight, `餘裕不足 5%：\n${tooTight.join('\n')}`).toHaveLength(0);
  }, 900_000);

  it('建議規模與深度在合理範圍且不倒退', () => {
    for (let i = 0; i < STAGES.length; i += 1) {
      const stage = STAGES[i]!;
      expect([1, 2]).toContain(stage.recommendedDepth);
      expect(stage.recommendedExtractors).toBeGreaterThanOrEqual(1);
      expect(stage.recommendedExtractors).toBeLessThan(stage.recommendedParcels);
      if (i > 0) {
        expect(stage.recommendedParcels).toBeGreaterThanOrEqual(STAGES[i - 1]!.recommendedParcels);
      }
    }
  });
});
