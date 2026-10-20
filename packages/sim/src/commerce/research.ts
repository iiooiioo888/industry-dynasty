/**
 * 研究目錄 · research catalog
 *
 * 原本只有一項研究（`consumer-line`，16 刻 = 三分之一天），而且寫死在
 * `commerce/logic.ts` 裡。結果是：**整局只有一次「等待解鎖」**，
 * 後期關卡沒有任何需要時間才能拿到的東西 —— 玩家第 6 天就把產能拉到頂，
 * 剩下的十幾天只是重複同樣的操作。
 *
 * 這裡把研究變成一條**有長度的鏈**：越後面的研究需要越久，
 * 而且要先完成前一項。時間本身因此成為一種資源。
 */
export type ResearchId = 'consumer-line' | 'precision-line' | 'control-line';

export interface ResearchDef {
  readonly id: ResearchId;
  readonly nameZh: string;
  /** 給玩家看的一句話：這項研究解鎖什麼 */
  readonly unlocks: string;
  readonly cost: number;
  /** 需要的刻數（一天 48 刻） */
  readonly ticks: number;
  /** 前置研究 */
  readonly requires?: ResearchId;
}

export const RESEARCH_DEFS: Record<ResearchId, ResearchDef> = {
  'consumer-line': {
    id: 'consumer-line',
    nameZh: '消費品產線',
    unlocks: '手工具、線束、封裝模組',
    cost: 2_800,
    ticks: 16,
  },
  'precision-line': {
    id: 'precision-line',
    nameZh: '精密加工',
    unlocks: '精密模組（合金板再加工）',
    cost: 12_000,
    // 一天半 —— 足夠讓玩家在等待期間必須安排別的產線
    ticks: 72,
    requires: 'consumer-line',
  },
  'control-line': {
    id: 'control-line',
    nameZh: '控制模組',
    unlocks: '控制單元（精密模組再加工）',
    cost: 30_000,
    // 三天 —— 後期的關卡必須提早開始，不能等到最後才做
    ticks: 144,
    requires: 'precision-line',
  },
};

export const RESEARCH_ORDER: readonly ResearchId[] = [
  'consumer-line',
  'precision-line',
  'control-line',
];

export const RESEARCH_TICKS_PER_DAY = 48;

/** 這項研究要花幾天（給 UI 與教學文案用） */
export function researchDays(def: ResearchDef): number {
  return Math.round((def.ticks / RESEARCH_TICKS_PER_DAY) * 10) / 10;
}

/**
 * 現在能不能開始這項研究。
 *
 * 前置未完成、已解鎖、或正在研究別項都會被擋下 ——
 * 回傳原因字串，讓 UI 能直接顯示「為什麼不能按」。
 */
export function canStartResearch(
  def: ResearchDef,
  unlocked: readonly string[],
  hasActiveJob: boolean,
): { ok: true } | { ok: false; reason: string } {
  if (unlocked.includes(def.id)) {
    return { ok: false, reason: '已完成' };
  }
  if (hasActiveJob) {
    return { ok: false, reason: '已有研究進行中' };
  }
  if (def.requires && !unlocked.includes(def.requires)) {
    return { ok: false, reason: `需先完成「${RESEARCH_DEFS[def.requires].nameZh}」` };
  }
  return { ok: true };
}
