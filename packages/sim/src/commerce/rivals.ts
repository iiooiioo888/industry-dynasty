import type { RivalOutlet } from './types.js';

/**
 * 對手主動行為 · rival counter-move
 *
 * 原本 `RivalOutlet.presence` 在開局固定為 0.4，之後**永遠不變** ——
 * 對手只是一個靜態的常數，玩家吃下市場也不會有人反應。
 *
 * 這裡讓對手會看玩家的整體市佔調整投入：
 * - 玩家市佔超過門檻 → 對手加碼（`presence` 上升，玩家的 `rivalFactor` 變差）
 * - 玩家聲勢回落 → 對手慢慢退場（回到基準值，不會無限上升）
 *
 * 這形成一個自然的張力：**主導一座城市會讓對手反撲**，
 * 玩家不能只靠一次佈局躺著賺。
 *
 * 對手的反應是**決定性的**（只看市佔與現值），沒有亂數 ——
 * 模擬必須可重現。
 */
export const RIVAL_BASE_PRESENCE = 0.4;
export const RIVAL_PRESENCE_CAP = 0.78;
/** 玩家市佔超過此值，對手開始加碼 */
export const RIVAL_COUNTER_THRESHOLD = 0.22;
/** 每次反制的基礎幅度 */
export const RIVAL_COUNTER_STEP = 0.04;
/** 市佔回落時，每期退回的幅度 */
export const RIVAL_RELAX_STEP = 0.015;

export interface RivalResponse {
  readonly rivals: readonly RivalOutlet[];
  /** 這一期加碼的對手（供 UI 提示） */
  readonly countered: readonly RivalOutlet[];
}

/**
 * 依玩家市佔調整對手投入。
 *
 * @param rivals 目前的對手門市
 * @param share 玩家整體市佔（0–1，見 `marketShareOf`）
 */
export function respondToPlayerShare(rivals: readonly RivalOutlet[], share: number): RivalResponse {
  if (rivals.length === 0) {
    return { rivals: [], countered: [] };
  }
  const aggressive = share >= RIVAL_COUNTER_THRESHOLD;
  const countered: RivalOutlet[] = [];
  const next = rivals.map((rival) => {
    if (aggressive) {
      // 市佔越高，加碼越猛（最高為基礎幅度的 3 倍）
      const intensity = 1 + Math.min(2, (share - RIVAL_COUNTER_THRESHOLD) * 8);
      const presence = Math.min(
        RIVAL_PRESENCE_CAP,
        rival.presence + RIVAL_COUNTER_STEP * intensity,
      );
      if (presence > rival.presence) {
        const updated = { ...rival, presence };
        countered.push(updated);
        return updated;
      }
      return rival;
    }
    // 聲勢回落：慢慢退回基準值，不會低於基準
    const presence = Math.max(RIVAL_BASE_PRESENCE, rival.presence - RIVAL_RELAX_STEP);
    return presence === rival.presence ? rival : { ...rival, presence };
  });
  return { rivals: next, countered };
}
