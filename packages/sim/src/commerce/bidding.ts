import type { ItemId } from '../production/items.js';

/**
 * 合約競標 · contract bidding
 *
 * 原本每座城市每天自動掛出一張合約，價格固定、數量固定 ——
 * 玩家只要接就贏，**沒有競爭**：`CityContract` 沒有對手報價，
 * `ACCEPT_CONTRACT` 也不會被拒絕。
 *
 * 這裡加上對手報價：
 * - 每張合約有一個**對手單價**（由城市與日期決定性推導）
 * - 玩家出價必須 **≤ 對手單價** 才標得到
 * - 出價越低越容易贏，但賺得越少 —— 這就是取捨
 *
 * 出價會記在 `CommerceState.contractBids`，接單時才判定。
 * 一切都是決定性的，模擬可重現。
 */
export interface ContractBid {
  readonly contractId: string;
  /** 玩家願意承接的單價 */
  readonly unitPrice: number;
  readonly day: number;
}

export interface BidOutcome {
  /** 玩家的出價是否壓過對手 */
  readonly won: boolean;
  /** 對手的單價（供 UI 顯示差距） */
  readonly rivalUnitPrice: number;
  /** 未標到的原因 */
  readonly reason?: string;
}

/** 出價最低不得低於競爭價的這個比例（避免離譜低價） */
export const MIN_BID_RATIO = 0.5;

function hashText(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * 對手報價：以合約面價為基礎，依城市與日期在 ±8% 內浮動。
 *
 * 這是「市場行情」——玩家必須壓到這條線以下才搶得到。
 */
export function rivalBidFor(args: {
  readonly contractId: string;
  readonly itemId: ItemId;
  readonly faceUnitPrice: number;
  readonly cityId: string;
  readonly gameDay: number;
}): number {
  const spread = (hashText(`${args.cityId}#${args.contractId}#${args.gameDay}`) % 1600) / 100 - 8;
  const factor = 1 + spread / 100;
  return Math.max(1, Math.round(args.faceUnitPrice * factor));
}

/** 判定一次出價是否得標。 */
export function resolveBid(args: {
  readonly bidUnitPrice: number;
  readonly rivalUnitPrice: number;
  readonly faceUnitPrice: number;
}): BidOutcome {
  const floor = Math.max(1, Math.round(args.faceUnitPrice * MIN_BID_RATIO));
  if (args.bidUnitPrice < floor) {
    return {
      won: false,
      rivalUnitPrice: args.rivalUnitPrice,
      reason: `出價低於底價 ${floor}`,
    };
  }
  if (args.bidUnitPrice > args.rivalUnitPrice) {
    return {
      won: false,
      rivalUnitPrice: args.rivalUnitPrice,
      reason: '出價高於對手，被搶走了',
    };
  }
  return { won: true, rivalUnitPrice: args.rivalUnitPrice };
}

/** 找出某張合約的玩家出價。 */
export function findBid(
  bids: readonly ContractBid[] | undefined,
  contractId: string,
): ContractBid | undefined {
  return (bids ?? []).find((bid) => bid.contractId === contractId);
}

/** 記錄／覆寫一次出價（同一張合約只保留最新一次）。 */
export function upsertBid(
  bids: readonly ContractBid[] | undefined,
  next: ContractBid,
): ContractBid[] {
  const rest = (bids ?? []).filter((bid) => bid.contractId !== next.contractId);
  return [...rest, next];
}
