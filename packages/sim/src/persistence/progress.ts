import { STAGES, stageById, stageByIndex } from '../balance/stages.js';

/**
 * 戰役進度 · campaign progress
 *
 * 22 關是線性推進的，需要記住「打過哪些關」才能決定哪些關卡可以選。
 * 這份資料跟存檔分開：存檔是**一局**的狀態，進度是**跨局**的紀錄，
 * 清掉存檔不該把已通關的紀錄一起清掉。
 *
 * 解鎖規則很簡單也很重要：**只能選已通關的關卡、下一個還沒打的關卡**。
 * 否則「跳關」會讓難度曲線失去意義。
 */
export const PROGRESS_VERSION = 1;

/** 單一關卡的最佳成績。 */
export interface StageBest {
  readonly netProfit: number;
  readonly craftedValue: number;
  /** 達成時的天數（越早越好） */
  readonly day: number;
}

export interface CampaignProgress {
  readonly version: number;
  /** 已通關的關卡 id */
  readonly clearedStageIds: readonly string[];
  /**
   * 各關最佳成績。舊進度檔沒有這個欄位，視為空。
   * 重玩時只保留更好的紀錄 —— 這讓「重打一關」有意義。
   */
  readonly bestScores?: Readonly<Record<string, StageBest>>;
}

export function emptyProgress(): CampaignProgress {
  return { version: PROGRESS_VERSION, clearedStageIds: [], bestScores: {} };
}

/** 取某關的最佳成績；沒打過回傳 undefined。 */
export function bestScoreFor(progress: CampaignProgress, stageId: string): StageBest | undefined {
  return progress.bestScores?.[stageId];
}

/** 新成績是否比舊成績好（以淨利為主，平手時比天數）。 */
function isBetterScore(next: StageBest, previous: StageBest | undefined): boolean {
  if (!previous) {
    return true;
  }
  if (next.netProfit !== previous.netProfit) {
    return next.netProfit > previous.netProfit;
  }
  return next.day < previous.day;
}

/** 第一關永遠開放。 */
export function isFirstStage(stageId: string): boolean {
  return STAGES[0]?.id === stageId;
}

/**
 * 這一關現在可以選嗎？
 *
 * 可以選的條件：已通關，或是「下一個還沒打的關卡」。
 */
export function isStageUnlocked(progress: CampaignProgress, stageId: string): boolean {
  if (isFirstStage(stageId)) {
    return true;
  }
  const cleared = new Set(progress.clearedStageIds);
  if (cleared.has(stageId)) {
    return true;
  }
  const stage = stageById(stageId);
  if (!stage) {
    return false;
  }
  // 前一關已通關 → 這一關解鎖
  const previous = stageByIndex(stage.index - 1);
  return previous ? cleared.has(previous.id) : false;
}

/** 已通關的先後順序（維持輸入順序，去重）。 */
function normalizeCleared(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const id of ids) {
    if (!stageById(id) || seen.has(id)) {
      continue;
    }
    seen.add(id);
    result.push(id);
  }
  return result;
}

/**
 * 記錄一次通關。
 *
 * - 沒帶成績：重複記錄同一關不會有副作用（回傳同一個物件）。
 * - 有帶成績：只在成績更好時更新，讓「重打一關」有意義。
 */
export function recordStageClear(
  progress: CampaignProgress,
  stageId: string,
  score?: StageBest,
): CampaignProgress {
  if (!stageById(stageId)) {
    return progress;
  }
  const alreadyCleared = progress.clearedStageIds.includes(stageId);

  if (score) {
    const previous = bestScoreFor(progress, stageId);
    if (!isBetterScore(score, previous)) {
      // 成績沒變好，但若是第一次通關仍要記錄
      if (alreadyCleared) {
        return progress;
      }
    } else {
      return {
        version: PROGRESS_VERSION,
        clearedStageIds: normalizeCleared([...progress.clearedStageIds, stageId]),
        bestScores: { ...(progress.bestScores ?? {}), [stageId]: score },
      };
    }
  }

  if (alreadyCleared) {
    return progress;
  }
  return {
    version: PROGRESS_VERSION,
    clearedStageIds: normalizeCleared([...progress.clearedStageIds, stageId]),
    bestScores: progress.bestScores ?? {},
  };
}

/** 下一個還沒通關的關卡（全部通關時回傳 undefined）。 */
export function nextUnclearedStage(progress: CampaignProgress) {
  const cleared = new Set(progress.clearedStageIds);
  return STAGES.find((stage) => !cleared.has(stage.id));
}

/** 是否全部通關。 */
export function isCampaignComplete(progress: CampaignProgress): boolean {
  return progress.clearedStageIds.length >= STAGES.length;
}

/** 進度百分比（0–100）。 */
export function completionPercent(progress: CampaignProgress): number {
  if (STAGES.length === 0) {
    return 0;
  }
  const valid = new Set(STAGES.map((stage) => stage.id));
  const cleared = progress.clearedStageIds.filter((id) => valid.has(id)).length;
  return Math.round((cleared / STAGES.length) * 100);
}

export type ProgressParseResult =
  | { readonly ok: true; readonly progress: CampaignProgress; readonly warnings: readonly string[] }
  | { readonly ok: false; readonly reason: string };

/**
 * 解析進度字串。
 *
 * 壞掉的進度不該讓遊戲開不起來 —— 呼叫端可以退回 `emptyProgress()`。
 */
export function parseProgress(jsonText: string): ProgressParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { ok: false, reason: '進度不是有效的 JSON' };
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reason: '進度格式不正確' };
  }
  const record = parsed as Record<string, unknown>;
  const version = record.version;
  if (typeof version !== 'number') {
    return { ok: false, reason: '進度缺少版本號' };
  }
  if (version > PROGRESS_VERSION) {
    return { ok: false, reason: `進度版本 ${version} 比遊戲新` };
  }
  const raw = record.clearedStageIds;
  if (!Array.isArray(raw)) {
    return { ok: false, reason: '進度缺少已通關清單' };
  }
  const ids = raw.filter((id): id is string => typeof id === 'string');
  const cleared = normalizeCleared(ids);
  const warnings: string[] = [];
  if (cleared.length !== ids.length) {
    warnings.push('進度中有無法辨識或重複的關卡，已忽略');
  }
  return {
    ok: true,
    progress: {
      version: PROGRESS_VERSION,
      clearedStageIds: cleared,
      bestScores: parseBestScores(record.bestScores),
    },
    warnings,
  };
}

/** 讀出最佳成績表，壞資料一律忽略（不要因為一筆爛資料就讓整份進度讀不進來）。 */
function parseBestScores(raw: unknown): Record<string, StageBest> {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return {};
  }
  const result: Record<string, StageBest> = {};
  for (const [stageId, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!stageById(stageId) || typeof value !== 'object' || value === null) {
      continue;
    }
    const record = value as Record<string, unknown>;
    const netProfit = record.netProfit;
    const craftedValue = record.craftedValue;
    const day = record.day;
    if (
      typeof netProfit !== 'number' ||
      typeof craftedValue !== 'number' ||
      typeof day !== 'number' ||
      !Number.isFinite(netProfit) ||
      !Number.isFinite(craftedValue) ||
      !Number.isFinite(day)
    ) {
      continue;
    }
    result[stageId] = { netProfit, craftedValue, day };
  }
  return result;
}

export function serializeProgress(progress: CampaignProgress): string {
  return JSON.stringify({
    version: PROGRESS_VERSION,
    clearedStageIds: normalizeCleared(progress.clearedStageIds),
    bestScores: progress.bestScores ?? {},
  });
}
