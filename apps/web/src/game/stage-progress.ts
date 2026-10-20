import {
  craftedValue,
  debtOf,
  emptyPnL,
  marketShareOf,
  netProfit,
  readCommerce,
  scenarioProgress,
  type ScenarioProgress,
  type StageDef,
  stageById,
  type WorldState,
} from '@industry-dynasty/sim';

/** 目前關卡的定義（舊存檔沒有 stageId 時回傳 null）。 */
export function currentStage(state: WorldState): StageDef | null {
  return stageById(state.scenario.config.stageId ?? '') ?? null;
}

/**
 * 把世界狀態換算成通關進度。
 *
 * 三條路線各自需要不同的資料（加工產值、城市佔比與營收、累計清償與負債），
 * UI 不該自己重算一次規則 —— 這裡只是把 `scenarioProgress` 需要的東西湊齊。
 */
export function computeStageProgress(state: WorldState): ScenarioProgress {
  const playerId = state.localPlayerId;
  const pnl = state.pnl[playerId] ?? emptyPnL();
  const commerce = readCommerce(state);
  const book = state.bank[playerId];
  const debt = book ? debtOf(book) : { principal: 0, arrears: 0 };

  return scenarioProgress(state.scenario, pnl, {
    craftedValue: craftedValue(state.craftedTotals[playerId]),
    commerce: {
      share: marketShareOf(commerce),
      consumerRevenue: commerce.consumerRevenue,
    },
    debtRepaid: book?.lifetimeRepaid ?? 0,
    outstandingDebt: debt.principal + debt.arrears,
  });
}

/** 顯示用的淨利（給標題列）。 */
export function currentNetProfit(state: WorldState): number {
  return netProfit(state.pnl[state.localPlayerId] ?? emptyPnL());
}
