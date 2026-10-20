import { describe, expect, it } from 'vitest';
import {
  PROGRESS_VERSION,
  bestScoreFor,
  completionPercent,
  emptyProgress,
  isCampaignComplete,
  isStageUnlocked,
  nextUnclearedStage,
  parseProgress,
  recordStageClear,
  serializeProgress,
} from './progress.js';
import { STAGES } from '../balance/stages.js';

/**
 * 戰役進度。
 *
 * 22 關是線性推進的，進度要跨局保留 —— 清掉存檔不該把已通關紀錄一起清掉。
 * 關鍵不變量：**不能跳關**（否則難度曲線失去意義）。
 */
describe('戰役進度', () => {
  it('一開始只有第一關可以選', () => {
    const progress = emptyProgress();
    expect(isStageUnlocked(progress, STAGES[0]!.id)).toBe(true);
    expect(isStageUnlocked(progress, STAGES[1]!.id)).toBe(false);
    expect(isStageUnlocked(progress, STAGES[10]!.id)).toBe(false);
  });

  it('通關一關就解鎖下一關', () => {
    const progress = recordStageClear(emptyProgress(), STAGES[0]!.id);
    expect(isStageUnlocked(progress, STAGES[0]!.id)).toBe(true);
    expect(isStageUnlocked(progress, STAGES[1]!.id)).toBe(true);
    expect(isStageUnlocked(progress, STAGES[2]!.id)).toBe(false);
  });

  it('不能跳關（即使前一關沒打）', () => {
    const progress = recordStageClear(emptyProgress(), STAGES[4]!.id);
    // 第 5 關本身可以重玩，但其餘未串連的關卡仍然鎖住
    expect(isStageUnlocked(progress, STAGES[5]!.id)).toBe(true);
    expect(isStageUnlocked(progress, STAGES[6]!.id)).toBe(false);
    expect(isStageUnlocked(progress, STAGES[9]!.id)).toBe(false);
  });

  it('重複記錄同一關不會有副作用', () => {
    const once = recordStageClear(emptyProgress(), STAGES[0]!.id);
    const twice = recordStageClear(once, STAGES[0]!.id);
    expect(twice).toBe(once);
  });

  it('記錄不存在的關卡會被忽略', () => {
    const progress = emptyProgress();
    expect(recordStageClear(progress, '不存在')).toBe(progress);
  });

  it('一路通關到底：全部解鎖且標記完成', () => {
    let progress = emptyProgress();
    for (const stage of STAGES) {
      expect(isStageUnlocked(progress, stage.id), `${stage.id} 應該已解鎖`).toBe(true);
      progress = recordStageClear(progress, stage.id);
    }
    expect(isCampaignComplete(progress)).toBe(true);
    expect(nextUnclearedStage(progress)).toBeUndefined();
    expect(completionPercent(progress)).toBe(100);
  });

  it('nextUnclearedStage 依序回傳', () => {
    let progress = emptyProgress();
    expect(nextUnclearedStage(progress)?.id).toBe(STAGES[0]!.id);
    progress = recordStageClear(progress, STAGES[0]!.id);
    expect(nextUnclearedStage(progress)?.id).toBe(STAGES[1]!.id);
  });

  it('completionPercent 依比例計算', () => {
    expect(completionPercent(emptyProgress())).toBe(0);
    const half = recordStageClear(recordStageClear(emptyProgress(), STAGES[0]!.id), STAGES[1]!.id);
    expect(completionPercent(half)).toBe(Math.round((2 / STAGES.length) * 100));
  });

  it('序列化後可以完整還原', () => {
    let progress = emptyProgress();
    progress = recordStageClear(progress, STAGES[0]!.id);
    progress = recordStageClear(progress, STAGES[1]!.id);
    const parsed = parseProgress(serializeProgress(progress));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.progress.clearedStageIds).toEqual(progress.clearedStageIds);
      expect(parsed.progress.version).toBe(PROGRESS_VERSION);
    }
  });

  it('壞掉的進度明確失敗，不丟例外', () => {
    const broken = parseProgress('{oops');
    expect(broken.ok).toBe(false);
    if (!broken.ok) {
      expect(broken.reason).toContain('JSON');
    }
    expect(parseProgress('[]').ok).toBe(false);
    expect(parseProgress('{}').ok).toBe(false);
    expect(parseProgress(JSON.stringify({ version: 1 })).ok).toBe(false);
  });

  it('版本比遊戲新會被拒絕', () => {
    const result = parseProgress(JSON.stringify({ version: 99, clearedStageIds: [] }));
    expect(result.ok).toBe(false);
  });

  it('忽略無法辨識與重複的關卡，並回報警告', () => {
    const result = parseProgress(
      JSON.stringify({
        version: PROGRESS_VERSION,
        clearedStageIds: ['stage-01', 'stage-01', '不存在', 'stage-02'],
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.progress.clearedStageIds).toEqual(['stage-01', 'stage-02']);
      expect(result.warnings.length).toBeGreaterThan(0);
    }
  });
});

describe('關卡最佳成績', () => {
  it('沒打過的關卡沒有成績', () => {
    expect(bestScoreFor(emptyProgress(), STAGES[0]!.id)).toBeUndefined();
  });

  it('第一次通關會記下成績', () => {
    const progress = recordStageClear(emptyProgress(), STAGES[0]!.id, {
      netProfit: 50_000,
      craftedValue: 40_000,
      day: 20,
    });
    expect(bestScoreFor(progress, STAGES[0]!.id)).toEqual({
      netProfit: 50_000,
      craftedValue: 40_000,
      day: 20,
    });
  });

  it('重打更好時會更新', () => {
    const first = recordStageClear(emptyProgress(), STAGES[0]!.id, {
      netProfit: 50_000,
      craftedValue: 40_000,
      day: 20,
    });
    const second = recordStageClear(first, STAGES[0]!.id, {
      netProfit: 70_000,
      craftedValue: 55_000,
      day: 22,
    });
    expect(bestScoreFor(second, STAGES[0]!.id)?.netProfit).toBe(70_000);
  });

  it('重打更差時保留舊紀錄', () => {
    const first = recordStageClear(emptyProgress(), STAGES[0]!.id, {
      netProfit: 70_000,
      craftedValue: 55_000,
      day: 22,
    });
    const second = recordStageClear(first, STAGES[0]!.id, {
      netProfit: 10_000,
      craftedValue: 5_000,
      day: 30,
    });
    expect(second).toBe(first);
    expect(bestScoreFor(second, STAGES[0]!.id)?.netProfit).toBe(70_000);
  });

  it('淨利相同時比天數（越早越好）', () => {
    const first = recordStageClear(emptyProgress(), STAGES[0]!.id, {
      netProfit: 50_000,
      craftedValue: 40_000,
      day: 20,
    });
    const faster = recordStageClear(first, STAGES[0]!.id, {
      netProfit: 50_000,
      craftedValue: 40_000,
      day: 15,
    });
    expect(bestScoreFor(faster, STAGES[0]!.id)?.day).toBe(15);

    const slower = recordStageClear(faster, STAGES[0]!.id, {
      netProfit: 50_000,
      craftedValue: 40_000,
      day: 25,
    });
    expect(bestScoreFor(slower, STAGES[0]!.id)?.day).toBe(15);
  });

  it('第一次通關即使成績不怎樣也會記錄', () => {
    const progress = recordStageClear(emptyProgress(), STAGES[0]!.id, {
      netProfit: 1,
      craftedValue: 1,
      day: 99,
    });
    expect(isStageUnlocked(progress, STAGES[1]!.id)).toBe(true);
    expect(bestScoreFor(progress, STAGES[0]!.id)?.netProfit).toBe(1);
  });

  it('成績表可以序列化並還原', () => {
    const progress = recordStageClear(emptyProgress(), STAGES[0]!.id, {
      netProfit: 50_000,
      craftedValue: 40_000,
      day: 20,
    });
    const parsed = parseProgress(serializeProgress(progress));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(bestScoreFor(parsed.progress, STAGES[0]!.id)).toEqual(
        bestScoreFor(progress, STAGES[0]!.id),
      );
    }
  });

  it('壞掉的成績資料被忽略，不會讓整份進度讀不進來', () => {
    const result = parseProgress(
      JSON.stringify({
        version: PROGRESS_VERSION,
        clearedStageIds: [STAGES[0]!.id],
        bestScores: {
          [STAGES[0]!.id]: { netProfit: 'x', craftedValue: 1, day: 2 },
          [STAGES[1]!.id]: 42,
          不存在: { netProfit: 1, craftedValue: 1, day: 1 },
        },
      }),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.progress.clearedStageIds).toEqual([STAGES[0]!.id]);
      expect(result.progress.bestScores).toEqual({});
    }
  });
});
