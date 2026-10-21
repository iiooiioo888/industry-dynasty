import { describe, expect, it } from 'vitest';
import { contractBoard } from './contracts.js';
import { createInitialWorld } from '../world/create-world.js';
import { applyWorldAction } from '../world/reducer.js';
import { readCommerce } from '../commerce/logic.js';
import type { WorldState } from '../world/state.js';

/**
 * 合約看板。
 *
 * 競標系統在模擬裡存在了好幾輪，但一直沒有 UI —— 這個看板是它的入口。
 * 測試要確保：行情價、出價狀態、庫存、天數都算對，
 * 而且「該做什麼」這句話不會誤導玩家。
 */
function withStock(state: WorldState, itemId: string, qty: number): WorldState {
  return {
    ...state,
    inventories: { ...state.inventories, [state.localPlayerId]: { [itemId]: qty } },
  };
}

function firstOpenContract(state: WorldState) {
  return readCommerce(state).contracts.find((contract) => contract.status === 'open')!;
}

describe('合約看板', () => {
  it('新局就看得到開放中的合約', () => {
    const board = contractBoard(createInitialWorld());
    expect(board.rows.length).toBeGreaterThan(0);
    for (const row of board.rows) {
      expect(row.cityName.length).toBeGreaterThan(0);
      expect(row.itemName.length).toBeGreaterThan(0);
      expect(row.quantity).toBeGreaterThan(0);
      expect(row.rivalUnitPrice).toBeGreaterThan(0);
      expect(row.daysLeft).toBeGreaterThanOrEqual(0);
    }
  });

  it('還沒出價時提示先出價，並帶出對手行情', () => {
    const state = createInitialWorld();
    const row = contractBoard(state).rows[0]!;
    expect(row.myBid).toBeNull();
    expect(row.wouldWin).toBe(false);
    expect(row.advice).toContain('對手行情');
    expect(row.advice).toContain(row.rivalUnitPrice.toLocaleString());
  });

  it('出價壓過對手後會被標記為可標到', () => {
    let state = createInitialWorld();
    const contract = firstOpenContract(state);
    const rival = contract.rivalUnitPrice ?? contract.unitPrice;
    state = applyWorldAction(state, {
      type: 'BID_CONTRACT',
      contractId: contract.id,
      unitPrice: rival,
    });
    const row = contractBoard(state).rows.find((entry) => entry.id === contract.id)!;
    expect(row.myBid).toBe(rival);
    expect(row.wouldWin).toBe(true);
  });

  it('出價太高時會說明被搶走', () => {
    let state = createInitialWorld();
    const contract = firstOpenContract(state);
    const rival = contract.rivalUnitPrice ?? contract.unitPrice;
    state = applyWorldAction(state, {
      type: 'BID_CONTRACT',
      contractId: contract.id,
      unitPrice: rival + 10,
    });
    const row = contractBoard(state).rows.find((entry) => entry.id === contract.id)!;
    expect(row.wouldWin).toBe(false);
    expect(row.advice).toContain('對手');
  });

  it('庫存不足時會算出還缺多少', () => {
    let state = createInitialWorld();
    const contract = firstOpenContract(state);
    const rival = contract.rivalUnitPrice ?? contract.unitPrice;
    state = applyWorldAction(state, {
      type: 'BID_CONTRACT',
      contractId: contract.id,
      unitPrice: rival,
    });
    state = withStock(state, contract.itemId, contract.quantity - 1);
    const row = contractBoard(state).rows.find((entry) => entry.id === contract.id)!;
    expect(row.enoughStock).toBe(false);
    expect(row.advice).toContain('缺 1');
  });

  it('庫存足夠且標到時，會列在「可以接單」', () => {
    let state = createInitialWorld();
    const contract = firstOpenContract(state);
    const rival = contract.rivalUnitPrice ?? contract.unitPrice;
    state = applyWorldAction(state, {
      type: 'BID_CONTRACT',
      contractId: contract.id,
      unitPrice: rival,
    });
    state = withStock(state, contract.itemId, contract.quantity);
    const board = contractBoard(state);
    const row = board.rows.find((entry) => entry.id === contract.id)!;
    expect(row.enoughStock).toBe(true);
    expect(row.wouldWin).toBe(true);
    expect(board.readyToAccept).toBeGreaterThanOrEqual(1);
  });

  it('估算營收用玩家的出價（不是面價）', () => {
    let state = createInitialWorld();
    const contract = firstOpenContract(state);
    const rival = contract.rivalUnitPrice ?? contract.unitPrice;
    state = applyWorldAction(state, {
      type: 'BID_CONTRACT',
      contractId: contract.id,
      unitPrice: rival,
    });
    const row = contractBoard(state).rows.find((entry) => entry.id === contract.id)!;
    expect(row.estimatedRevenue).toBe(row.myBid! * row.quantity);
  });

  it('排序：可接單的在最前面', () => {
    let state = createInitialWorld();
    const open = readCommerce(state).contracts.filter((c) => c.status === 'open');
    const target = open[open.length - 1]!;
    const rival = target.rivalUnitPrice ?? target.unitPrice;
    state = applyWorldAction(state, {
      type: 'BID_CONTRACT',
      contractId: target.id,
      unitPrice: rival,
    });
    state = withStock(state, target.itemId, target.quantity);
    const board = contractBoard(state);
    expect(board.rows[0]!.id).toBe(target.id);
  });

  it('在途與逾期合約不會出現在看板上', () => {
    const state = createInitialWorld();
    const board = contractBoard(state);
    const commerce = readCommerce(state);
    const openIds = new Set(commerce.contracts.filter((c) => c.status === 'open').map((c) => c.id));
    for (const row of board.rows) {
      expect(openIds.has(row.id)).toBe(true);
    }
  });
});
