import { describe, expect, it } from 'vitest';
import {
  PROGRESS_VERSION,
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
