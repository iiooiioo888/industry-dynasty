import { FACTORY_TYPES } from '../buildings/catalog.js';
import { getItemQty, ITEMS } from '../production/items.js';
import { RECIPES } from '../production/recipes.js';
import type { WorldState } from '../world/state.js';

/**
 * 產線狀態一覽 · production status
 *
 * 原本玩家只能一座一座工廠點進去看。工廠一多就不知道：
 * 哪條線在跑、哪條卡住、卡在缺料還是缺技師。
 *
 * 這裡把每一條產線整理成一列，附上「卡住的原因」——
 * 判斷邏輯集中在純函式，UI 只負責顯示。
 */
export type LineBlocker = 'no-input' | 'idle' | 'stalled' | 'running' | 'done';

export interface LineStatus {
  readonly parcelKey: string;
  readonly factoryTypeId: string;
  readonly factoryName: string;
  readonly recipeId: string;
  readonly recipeName: string;
  /** 這一條線在做什麼（產出什麼） */
  readonly outputItem: string;
  /** 0–1 */
  readonly progress: number;
  readonly completedRuns: number;
  readonly idleLoss: number;
  readonly blocker: LineBlocker;
  /** 給玩家看的一句話 */
  readonly note: string;
}

export interface ProductionSummary {
  readonly lines: readonly LineStatus[];
  readonly running: number;
  readonly blocked: number;
  readonly totalIdleLoss: number;
}

/**
 * 推導每一條產線的狀態。
 *
 * 「缺料」的判定用**這一刻的庫存**：如果配方投入不足，下一次週期就會停擺，
 * 這是玩家最需要知道的資訊（比「已暫停」更早一步）。
 */
export function summarizeProduction(state: WorldState): ProductionSummary {
  const playerId = state.localPlayerId;
  const stock = state.inventories[playerId] ?? {};
  const lines: LineStatus[] = [];

  for (const [parcelKey, line] of Object.entries(state.productionLines)) {
    const site = state.sites[parcelKey];
    const recipe = RECIPES[line.recipeId];
    if (!recipe) {
      continue;
    }
    const factoryTypeId = site?.factoryTypeId ?? 'workshop';
    const output = ITEMS[recipe.outputItemId];
    const progress = line.cycleTicks > 0 ? Math.min(1, line.progressTicks / line.cycleTicks) : 0;

    // 投入不足 → 下個週期就會停
    let missing: string | null = null;
    for (const input of recipe.inputs) {
      const have = getItemQty(stock, input.itemId);
      if (have < input.quantity) {
        const listed = ITEMS[input.itemId as keyof typeof ITEMS];
        missing = `${listed?.nameZh ?? input.itemId}（缺 ${input.quantity - have}）`;
        break;
      }
    }

    let blocker: LineBlocker;
    let note: string;
    if (missing) {
      blocker = 'no-input';
      note = `缺料：${missing}`;
    } else if (line.idleTicksAccumulated > 0) {
      blocker = 'idle';
      note = `閒置 ${line.idleTicksAccumulated} 刻（累計損失 $${Math.round(line.totalIdleLossValue)}）`;
    } else if (line.status === 'waiting_inputs') {
      blocker = 'no-input';
      note = '等待原料';
    } else if (line.status === 'stopped') {
      blocker = 'stalled';
      note = '已停止';
    } else {
      blocker = 'running';
      note = `進行中 ${Math.round(progress * 100)}%`;
    }

    lines.push({
      parcelKey,
      factoryTypeId,
      factoryName: FACTORY_TYPES[factoryTypeId]?.nameZh ?? factoryTypeId,
      recipeId: line.recipeId,
      recipeName: recipe.nameZh,
      outputItem: output?.nameZh ?? recipe.outputItemId,
      progress,
      completedRuns: line.completedRuns,
      idleLoss: Math.round(line.totalIdleLossValue),
      blocker,
      note,
    });
  }

  lines.sort((a, b) => a.parcelKey.localeCompare(b.parcelKey));
  return {
    lines,
    running: lines.filter((line) => line.blocker === 'running').length,
    blocked: lines.filter((line) => line.blocker === 'no-input' || line.blocker === 'idle').length,
    totalIdleLoss: lines.reduce((sum, line) => sum + line.idleLoss, 0),
  };
}
