import type { WorldAction } from '../world/actions.js';
import type { WorldState } from '../world/state.js';

/**
 * 音效提示 · sound cues
 *
 * 原本點任何按鈕都**完全沒有回饋** —— 買地成功、出價失敗、通關，畫面都一樣。
 * 音效是便宜的體感來源（用 Web Audio 生成，不需要任何素材檔）。
 *
 * 這裡只負責**規則**：什麼動作該發什麼聲音、以及該不該發聲音。
 * 真正的播放留給瀏覽器端 —— 這樣規則可以被測試，而音訊不會進到模擬核心。
 *
 * 重要原則：**失敗的動作不該發出成功音**。所以判定要看動作前後的狀態差異，
 * 而不是只看動作了什麼（`applyWorldAction` 對無效操作會回傳原狀態）。
 */
export type SoundCue =
  | 'click'
  | 'bid'
  | 'deal-won'
  | 'deal-lost'
  | 'build-start'
  | 'build-done'
  | 'production-start'
  | 'cash-in'
  | 'day-close'
  | 'stage-won'
  | 'stage-lost'
  | 'error';

/** 動作是否真的改變了狀態（無效操作會回傳同一個物件）。 */
function changed(before: WorldState, after: WorldState): boolean {
  return before !== after;
}

function cashOf(state: WorldState): number {
  return state.players[state.localPlayerId]?.cash ?? 0;
}

/**
 * 由「動作前 → 動作後」決定要播哪個音效。
 *
 * 回傳 `null` 表示不需要聲音（例如純時間推進、或無效操作）。
 */
export function cueForAction(
  action: WorldAction,
  before: WorldState,
  after: WorldState,
): SoundCue | null {
  const applied = changed(before, after);

  // 關卡結束優先於一切 —— 這是玩家最需要注意到的事件
  if (after.scenario.status !== before.scenario.status) {
    if (after.scenario.status === 'won') {
      return 'stage-won';
    }
    if (after.scenario.status === 'lost') {
      return 'stage-lost';
    }
  }

  switch (action.type) {
    case 'BID':
      return applied ? 'bid' : 'error';
    case 'SETTLE_AUCTION':
      // 沒標到（沒有得標者）也算「動作沒生效」
      return applied ? 'deal-won' : 'error';
    case 'BID_CONTRACT':
      return applied ? 'bid' : 'error';
    case 'ACCEPT_CONTRACT':
      return applied ? 'deal-won' : 'deal-lost';
    case 'SELL_TO_NPC':
    case 'ACCEPT_NPC_DEAL':
      return applied ? 'cash-in' : 'error';
    case 'START_BUILD':
      return applied ? 'build-start' : 'error';
    case 'CANCEL_BUILD':
    case 'DEMOLISH':
      return applied ? 'click' : 'error';
    case 'START_PRODUCTION':
      return applied ? 'production-start' : 'error';
    case 'STOP_PRODUCTION':
      return applied ? 'click' : 'error';
    case 'SET_SHELF':
    case 'HIRE_STAFF':
    case 'FIRE_STAFF':
    case 'START_RESEARCH':
    case 'BUY_CAMPAIGN':
    case 'INSTALL_MACHINE':
    case 'OPEN_SAVINGS':
    case 'WITHDRAW_SAVINGS':
    case 'DRAW_LOAN':
    case 'REPAY_LOAN':
    case 'BUY_STOCK':
    case 'SELL_STOCK':
    case 'BUY_COMMODITY':
    case 'SELL_COMMODITY':
    case 'PLACE_LIMIT':
    case 'CANCEL_LIMIT':
    case 'BUY_BOND':
    case 'SELL_BOND':
    case 'SELL_LAND':
      return applied ? 'click' : 'error';
    case 'ADVANCE_DAY':
      // 日結：有進帳就給現金音，否則只有日期跳動
      if (!applied) {
        return 'error';
      }
      return cashOf(after) > cashOf(before) ? 'cash-in' : 'day-close';
    case 'ADVANCE_TAX_TICK':
    case 'ADVANCE_FINANCE_TICK':
    case 'ADVANCE_PRODUCTION_TICK':
    case 'ADVANCE_BUILD_TICK':
    case 'ADVANCE_SIM_TIME':
    case 'SET_CLOCK':
      return null;
  }
  return null;
}

/**
 * 建造完成的通知。
 *
 * 建造是跨刻推進的（`ADVANCE_BUILD_TICK`），完工那一刻才算「完成」，
 * 所以另外給一個判定：動作前後的**完工工地數**是否增加。
 */
export function cueForBuildCompletion(before: WorldState, after: WorldState): SoundCue | null {
  const complete = (state: WorldState): number =>
    Object.values(state.sites).filter((site) => site.phase === 'complete').length;
  return complete(after) > complete(before) ? 'build-done' : null;
}

/** 音效的預設音量（0–1），供瀏覽器端初始化。 */
export const DEFAULT_CUE_VOLUME = 0.18;
