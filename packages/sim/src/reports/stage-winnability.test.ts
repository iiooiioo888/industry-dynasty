import { describe, expect, it } from 'vitest';
import { STAGES } from '../balance/stages.js';
import { runFullLoop } from './full-loop.js';

/**
 * 關卡可通關性護欄。
 *
 * 關卡表光看數字是沒用的 —— 目標必須在**實際模擬**裡打得過。
 * 我第一版把後段加工目標設到 72 萬，實測上限只有約 23 萬，
 * 也就是後半段的工業化路線根本不可能達成。這條測試就是為了抓這種事：
 *
 * 對每一關，用「起始資金 ＋ 該關天數 ＋ 該關目標」跑一次完整迴圈
 * （8 塊地、二階加工），要求至少有一種配置能通關。
 *
 * 如果日後調整了配方、成本或關卡目標而讓某關變成不可能，
 * 這條測試會直接指出是哪一關。
 */
describe('關卡可通關性', () => {
  it('每一關都至少有一種配置能通關', () => {
    const failures: string[] = [];
    for (const stage of STAGES) {
      let won = false;
      for (const depth of [1, 2] as const) {
        for (const maxParcels of [6, 8]) {
          const result = runFullLoop({
            maxParcels,
            depth,
            extractorCount: 3,
            startingCash: stage.startingCash,
            maxDays: stage.maxDays,
            config: { stageId: stage.id },
          });
          if (result.status === 'won') {
            won = true;
            break;
          }
        }
        if (won) {
          break;
        }
      }
      if (!won) {
        failures.push(`${stage.id}（${stage.nameZh}）`);
      }
    }
    expect(failures, `以下關卡無法通關：${failures.join('、')}`).toHaveLength(0);
  }, 120_000);

  it('最後一關不只是「剛好壓線」—— 最佳配置要留餘裕', () => {
    // 注意：不是每一種配置都會更好。實測「8 塊地二階」在資金充裕時
    // 反而會過度投資而虧錢（−4,291），所以這裡取**所有配置的最好成績**。
    const last = STAGES[STAGES.length - 1]!;
    let bestProfit = Number.NEGATIVE_INFINITY;
    let bestCrafted = Number.NEGATIVE_INFINITY;
    for (const depth of [1, 2] as const) {
      for (const maxParcels of [6, 8]) {
        const result = runFullLoop({
          maxParcels,
          depth,
          extractorCount: 3,
          startingCash: last.startingCash,
          maxDays: last.maxDays,
          config: { stageId: last.id },
        });
        bestProfit = Math.max(bestProfit, result.netProfit);
        bestCrafted = Math.max(bestCrafted, result.craftedValue);
      }
    }
    expect(bestCrafted).toBeGreaterThan(last.targets.craftedValue);
    expect(bestProfit).toBeGreaterThan(last.targets.netProfit);
  }, 60_000);
});
