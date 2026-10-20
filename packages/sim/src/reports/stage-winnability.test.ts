import { describe, expect, it } from 'vitest';
import { STAGES } from '../balance/stages.js';
import { runFullLoop } from './full-loop.js';

/**
 * 關卡可通關性護欄。
 *
 * 這條測試抓過三次真實的錯誤：
 * 1. 後段加工目標設到 72 萬，實測上限只有約 23 萬 → 工業化路線不可能達成。
 * 2. 「建議規模」原本是極限最小規模，好幾關餘裕只剩 0.2%–5%
 *    （第 15 關 0.2%、第 19 關 0.6%）—— 那不是建議，是走鋼索。
 * 3. 第 5–10 關想用 3–4 塊地跑二階，結果直接崩掉（二階需要 6 塊地）。
 *
 * 現在每一關都帶實測的 `recommendedParcels / Depth / Extractors`，
 * 測試用那組數字實際跑一次，並檢查餘裕。
 */
describe('關卡可通關性', () => {
  it('每一關在建議規模下都真的打得過', () => {
    const failures: string[] = [];
    for (const stage of STAGES) {
      const result = runFullLoop({
        maxParcels: stage.recommendedParcels,
        depth: stage.recommendedDepth,
        extractorCount: stage.recommendedExtractors,
        startingCash: stage.startingCash,
        maxDays: stage.maxDays,
        config: { stageId: stage.id },
      });
      if (result.status !== 'won') {
        failures.push(
          `${stage.id}（建議 ${stage.recommendedParcels} 塊地／深度 ${stage.recommendedDepth}）`,
        );
      }
    }
    expect(failures, `以下關卡在建議規模下無法通關：${failures.join('、')}`).toHaveLength(0);
  }, 180_000);

  it('通關餘裕不會薄到只剩運氣（至少 5%）', () => {
    // 曾經有幾關的餘裕只有 0.2%–0.6%，經濟參數一點風吹草動就會變成無法通關。
    // 這裡設一個下限，避免「目標剛好等於模擬天花板」的情況再出現。
    const MIN_HEADROOM = 0.05;
    const tooTight: string[] = [];
    for (const stage of STAGES) {
      const result = runFullLoop({
        maxParcels: stage.recommendedParcels,
        depth: stage.recommendedDepth,
        extractorCount: stage.recommendedExtractors,
        startingCash: stage.startingCash,
        maxDays: stage.maxDays,
        config: { stageId: stage.id },
      });
      const profitMargin = (result.netProfit - stage.targets.netProfit) / stage.targets.netProfit;
      const craftedMargin =
        (result.craftedValue - stage.targets.craftedValue) / stage.targets.craftedValue;
      if (profitMargin < MIN_HEADROOM || craftedMargin < MIN_HEADROOM) {
        tooTight.push(
          `${stage.id}（淨利 ${(profitMargin * 100).toFixed(1)}%、加工 ${(craftedMargin * 100).toFixed(1)}%）`,
        );
      }
    }
    expect(tooTight, `以下關卡餘裕不足 5%：${tooTight.join('、')}`).toHaveLength(0);
  }, 180_000);

  it('建議規模是「真的最小」——少一塊地就過不了（抽查代表性關卡）', () => {
    const samples = [STAGES[0]!, STAGES[6]!, STAGES[STAGES.length - 1]!];
    for (const stage of samples) {
      const fewer = Math.max(2, stage.recommendedParcels - 1);
      const result = runFullLoop({
        maxParcels: fewer,
        depth: stage.recommendedDepth,
        extractorCount: stage.recommendedExtractors,
        startingCash: stage.startingCash,
        maxDays: stage.maxDays,
        config: { stageId: stage.id },
      });
      expect(result.status, `${stage.id} 在 ${fewer} 塊地時竟然也能通關 → 建議規模被高估`).not.toBe(
        'won',
      );
    }
  }, 120_000);

  it('建議規模隨關卡推進不倒退，且深度與開採廠數量合理', () => {
    for (let i = 0; i < STAGES.length; i += 1) {
      const stage = STAGES[i]!;
      expect([1, 2]).toContain(stage.recommendedDepth);
      expect(stage.recommendedExtractors).toBeGreaterThanOrEqual(1);
      expect(stage.recommendedExtractors).toBeLessThan(stage.recommendedParcels);
      if (i > 0) {
        expect(stage.recommendedParcels, `${stage.id} 的建議規模比前一關小`).toBeGreaterThanOrEqual(
          STAGES[i - 1]!.recommendedParcels,
        );
      }
    }
  });
});
