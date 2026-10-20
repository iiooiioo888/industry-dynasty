import { describe, expect, it } from 'vitest';
import { STAGES } from '../balance/stages.js';
import { runFullLoop } from './full-loop.js';

/**
 * 關卡可通關性護欄。
 *
 * 關卡表光看數字是沒用的 —— 目標必須在**實際模擬**裡打得過。
 * 我第一版把後段加工目標設到 72 萬，實測上限只有約 23 萬，
 * 也就是後半段的工業化路線根本不可能達成。這條測試就是為了抓這種事。
 *
 * 現在每一關都帶 `recommendedParcels / Depth / Extractors`（實測值），
 * 測試就用那組數字實際跑一次，要求**每一關都能通關**。
 * 好處是：關卡卡片顯示的「建議規模」不是文案，而是被驗證過的事實。
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
          `${stage.id}（建議 ${stage.recommendedParcels} 塊地／深度 ${stage.recommendedDepth}／開採 ${stage.recommendedExtractors}）`,
        );
      }
    }
    expect(failures, `以下關卡在建議規模下無法通關：${failures.join('、')}`).toHaveLength(0);
  }, 180_000);

  it('建議規模隨關卡推進不倒退', () => {
    for (let i = 1; i < STAGES.length; i += 1) {
      expect(
        STAGES[i]!.recommendedParcels,
        `${STAGES[i]!.id} 的建議規模比前一關小`,
      ).toBeGreaterThanOrEqual(STAGES[i - 1]!.recommendedParcels);
    }
  });

  it('建議規模是「真的最小」——少一塊地就過不了（抽查代表性關卡）', () => {
    // 全部 22 關都做「少一塊地」驗證會太慢，所以抽三關：
    // 一階的起點、一階的上限、二階的代表。
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

  it('建議的加工深度與開採廠數量在合理範圍', () => {
    for (const stage of STAGES) {
      expect([1, 2]).toContain(stage.recommendedDepth);
      expect(stage.recommendedExtractors).toBeGreaterThanOrEqual(1);
      expect(stage.recommendedExtractors).toBeLessThan(stage.recommendedParcels);
    }
  });
});
