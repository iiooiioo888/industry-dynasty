import { findBid, resolveBid } from '../commerce/bidding.js';
import { readCommerce } from '../commerce/logic.js';
import { getItemQty, ITEMS } from '../production/items.js';
import type { WorldState } from '../world/state.js';

/**
 * 合約看板 · contract board
 *
 * 合約競標從第 2 回合就做進模擬了，但**一直沒有 UI** ——
 * 玩家根本無法投標或接單，整個系統在遊戲裡是隱形的。
 *
 * 這裡把合約整理成「玩家要決定的事」：
 * - 對手的行情價是多少
 * - 我目前的出價能不能標到
 * - 我手上的貨夠不夠交
 * - 現在出價大概賺多少、違約會賠多少
 *
 * 判斷集中在純函式，UI 只負責顯示與送出動作。
 */
export interface ContractRow {
  readonly id: string;
  readonly cityName: string;
  readonly itemName: string;
  readonly quantity: number;
  readonly faceUnitPrice: number;
  readonly rivalUnitPrice: number;
  /** 玩家目前的出價；沒出價時為 null */
  readonly myBid: number | null;
  /** 目前出價是否壓過對手 */
  readonly wouldWin: boolean;
  /** 壓線建議價（等於對手行情，越小越容易標到但賺得越少） */
  readonly suggestedBid: number;
  readonly daysLeft: number;
  readonly penalty: number;
  /** 手上有的數量 */
  readonly stock: number;
  readonly enoughStock: boolean;
  /** 以目前出價（或建議價）估算的營收 */
  readonly estimatedRevenue: number;
  /** 一句話：現在該做什麼 */
  readonly advice: string;
}

export interface ContractBoard {
  readonly rows: readonly ContractRow[];
  /** 可以立刻接單的張數（已出價且壓過對手、貨也夠） */
  readonly readyToAccept: number;
}

/**
 * 整理目前所有開放中的合約。
 *
 * 只列 `status === 'open'` 的 —— 在途與已結案的合約在帳本裡看得到。
 */
export function contractBoard(state: WorldState): ContractBoard {
  const commerce = readCommerce(state);
  const playerId = state.localPlayerId;
  const stock = state.inventories[playerId] ?? {};
  const rows: ContractRow[] = [];

  for (const contract of commerce.contracts) {
    if (contract.status !== 'open') {
      continue;
    }
    const listed = ITEMS[contract.itemId];
    const rival = contract.rivalUnitPrice ?? contract.unitPrice;
    const bid = findBid(commerce.contractBids, contract.id);
    const outcome = bid
      ? resolveBid({
          bidUnitPrice: bid.unitPrice,
          rivalUnitPrice: rival,
          faceUnitPrice: contract.unitPrice,
        })
      : null;
    const held = getItemQty(stock, contract.itemId);
    const enoughStock = held >= contract.quantity;
    const effectiveBid = bid?.unitPrice ?? rival;
    const daysLeft = Math.max(0, contract.dueDay - state.gameDay);

    let advice: string;
    if (!bid) {
      advice = `先出價：對手行情 $${rival.toLocaleString()}`;
    } else if (!outcome?.won) {
      advice = outcome?.reason ?? '出價沒有壓過對手';
    } else if (!enoughStock) {
      advice = `標到了，但還缺 ${contract.quantity - held} 個${listed?.nameZh ?? contract.itemId}`;
    } else if (daysLeft === 0) {
      advice = '今天到期，可以接單出貨';
    } else {
      advice = `標到了，還有 ${daysLeft} 天可以備貨`;
    }

    rows.push({
      id: contract.id,
      cityName: contract.cityName,
      itemName: listed?.nameZh ?? contract.itemId,
      quantity: contract.quantity,
      faceUnitPrice: contract.unitPrice,
      rivalUnitPrice: rival,
      myBid: bid?.unitPrice ?? null,
      wouldWin: outcome?.won ?? false,
      suggestedBid: rival,
      daysLeft,
      penalty: contract.penalty,
      stock: held,
      enoughStock,
      estimatedRevenue: effectiveBid * contract.quantity,
      advice,
    });
  }

  // 先列「現在就能接」的，再列「還沒出價」的，最後是「標不到」的
  const rank = (row: ContractRow): number => {
    if (row.wouldWin && row.enoughStock) return 0;
    if (row.myBid === null) return 1;
    return row.wouldWin ? 1 : 2;
  };
  rows.sort((a, b) => rank(a) - rank(b) || a.daysLeft - b.daysLeft || a.id.localeCompare(b.id));

  return {
    rows,
    readyToAccept: rows.filter((row) => row.wouldWin && row.enoughStock).length,
  };
}
