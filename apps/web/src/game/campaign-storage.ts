import {
  emptyProgress,
  parseProgress,
  recordStageClear,
  serializeProgress,
  type CampaignProgress,
  type StageBest,
} from '@industry-dynasty/sim';

/**
 * 戰役進度的瀏覽器儲存。
 *
 * 跟「存檔」分開存：存檔是一局的狀態，進度是跨局紀錄。
 * 清掉存檔不該把已通關的關卡一起清掉。
 */
const STORAGE_KEY = 'industry-dynasty/progress/v1';

function storage(): Storage | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return null;
    }
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadProgress(): CampaignProgress {
  const raw = storage()?.getItem(STORAGE_KEY);
  if (!raw) {
    return emptyProgress();
  }
  const parsed = parseProgress(raw);
  return parsed.ok ? parsed.progress : emptyProgress();
}

export function saveProgress(progress: CampaignProgress): void {
  try {
    storage()?.setItem(STORAGE_KEY, serializeProgress(progress));
  } catch {
    // 進度存不起來不該讓遊戲中斷；下一次通關會再試
  }
}

export function markStageCleared(stageId: string, score?: StageBest): CampaignProgress {
  const next = recordStageClear(loadProgress(), stageId, score);
  saveProgress(next);
  return next;
}

export function clearProgress(): void {
  storage()?.removeItem(STORAGE_KEY);
}
