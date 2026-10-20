import { FACTORY_TYPES } from '../buildings/catalog.js';
import { readCommerce } from '../commerce/logic.js';
import { getItemQty, ITEMS } from '../production/items.js';
import { craftedValue } from '../production/chain.js';
import { netProfit } from '../sales/pnl.js';
import type { WorldState } from '../world/state.js';

/**
 * 教學引導 · onboarding guidance
 *
 * 新玩家一開局面對 22 關、十幾個面板，卻沒有任何「現在該做什麼」的提示。
 *
 * 這裡不做腳本式的固定教學，而是**從當前狀態推導下一步**：
 * 每一步都附帶「怎麼判定已完成」，所以玩家不管用什麼順序玩，
 * 提示都會自動跳到還沒完成的那一步。這比固定註冊流程耐用得多 ——
 * 玩家亂點也不會卡在一個做不到的指示上。
 */
export type GuidanceStepId =
  | 'bid-land'
  | 'build-workshop'
  | 'start-production'
  | 'sell-output'
  | 'build-processor'
  | 'hire-operator'
  | 'watch-tax';

export interface GuidanceStep {
  readonly id: GuidanceStepId;
  /** 標題（短） */
  readonly title: string;
  /** 具體要做什麼 */
  readonly detail: string;
}

export interface GuidanceState {
  /** 目前該做的下一步；全部完成時為 null */
  readonly step: GuidanceStep | null;
  /** 已完成的步驟數 */
  readonly completed: number;
  /** 總步驟數 */
  readonly total: number;
}

const STEPS: readonly GuidanceStep[] = [
  {
    id: 'bid-land',
    title: '先標一塊地',
    detail: '拍賣中的地塊會顯示底價。先出一口價，再用「結標」把它標下來。',
  },
  {
    id: 'build-workshop',
    title: '蓋一座工坊',
    detail: '選中自己的地塊，在建造面板選「小型工坊」。工坊不需要材料，只要現金。',
  },
  {
    id: 'start-production',
    title: '讓產線動起來',
    detail: '工坊蓋好後選一條開採配方開工。產線沒開就不會有任何收入。',
  },
  {
    id: 'sell-output',
    title: '把貨賣掉',
    detail: '庫存會累積。到市場面板把原料賣給開價最好的買家 —— 帳面庫存不等於現金。',
  },
  {
    id: 'hire-operator',
    title: '雇一位技師',
    detail: '技師會把產線吞吐拉起來；在職越久越熟練。沒有技師時產量維持原樣。',
  },
  {
    id: 'build-processor',
    title: '往加工走一步',
    detail: '光賣原料到不了通關門檻。再蓋一座工坊跑「基礎零件」，把價值加上去。',
  },
  {
    id: 'watch-tax',
    title: '留意固定成本',
    detail: '土地稅與廠房維護每天扣。現金不足以繳稅時土地會被收回拍賣。',
  },
];

/** 這一局的產線數（含未運轉）。 */
function productionLineCount(state: WorldState): number {
  return Object.keys(state.productionLines ?? {}).length;
}

function completeFactoryCount(state: WorldState, playerId: string): number {
  return Object.values(state.sites).filter(
    (site) => site.ownerId === playerId && site.phase === 'complete',
  ).length;
}

function isStepDone(step: GuidanceStepId, state: WorldState, playerId: string): boolean {
  const player = state.players[playerId];
  const owned = state.map.parcels.filter((parcel) => parcel.ownerId === playerId).length;
  switch (step) {
    case 'bid-land':
      return owned > 0;
    case 'build-workshop': {
      const hasComplete = Object.values(state.sites).some(
        (site) => site.ownerId === playerId && site.phase === 'complete',
      );
      const building = Object.values(state.sites).some(
        (site) => site.ownerId === playerId && site.phase !== 'complete',
      );
      return hasComplete || building;
    }
    case 'start-production':
      return productionLineCount(state) > 0;
    case 'sell-output':
      // 賣過東西：營收 > 0，或現金已經高於起始值
      return (player?.cash ?? 0) > 0 && netProfit(state.pnl[playerId]) > 0;
    case 'hire-operator':
      return readCommerce(state).staff.operators > 0;
    case 'build-processor': {
      if (completeFactoryCount(state, playerId) < 2) {
        return false;
      }
      return craftedValue(state.craftedTotals[playerId]) > 0;
    }
    case 'watch-tax':
      // 走到這裡代表已經撐過扣稅（有現金且玩過一天以上）
      return state.gameDay >= 1 && (player?.cash ?? 0) > 0;
  }
}

/**
 * 算出目前的引導狀態。
 *
 * 依序找第一個還沒完成的步驟 —— 玩家跳著做也沒關係，
 * 只要某步的判定條件成立就會被跳過。
 */
export function guidanceFor(state: WorldState): GuidanceState {
  const playerId = state.localPlayerId;
  let completed = 0;
  for (const step of STEPS) {
    if (isStepDone(step.id, state, playerId)) {
      completed += 1;
      continue;
    }
    return { step, completed, total: STEPS.length };
  }
  return { step: null, completed, total: STEPS.length };
}

/** 給 UI 用的倉庫摘要（引導第 4 步會用到）。 */
export function sellableSummary(state: WorldState): string {
  const stock = state.inventories[state.localPlayerId] ?? {};
  const parts: string[] = [];
  for (const [itemId, qty] of Object.entries(stock)) {
    if (qty <= 0) {
      continue;
    }
    const item = ITEMS[itemId as keyof typeof ITEMS];
    if (!item?.sellable) {
      continue;
    }
    parts.push(`${item.nameZh} ×${getItemQty(stock, itemId)}`);
  }
  return parts.join('、');
}

/** 建築物種的中文名（引導文案用）。 */
export function factoryLabel(factoryTypeId: keyof typeof FACTORY_TYPES): string {
  return FACTORY_TYPES[factoryTypeId].nameZh;
}
