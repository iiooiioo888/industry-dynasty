import { describe, expect, it } from 'vitest';
import { FACTORY_TYPES } from '../buildings/catalog.js';
import { parcelIdFromCoords } from '../types/map.js';
import { applyWorldAction } from '../world/reducer.js';
import { createInitialWorld } from '../world/create-world.js';
import { findOpenLotForParcel, getSite } from '../world/state.js';
import {
  formatBps,
  quoteCommodityAsk,
  quoteCommodityBid,
  quoteStock,
  quoteStockSeries,
} from './quotes.js';
import { previewCoupledWeek, summarizeBank } from './logic.js';

function ownParcel(state: ReturnType<typeof createInitialWorld>, x: number, y: number) {
  const parcelId = parcelIdFromCoords(x, y);
  const lot = findOpenLotForParcel(state, parcelId)!;
  let next = applyWorldAction(state, { type: 'BID', parcelId, amount: lot.minPrice });
  next = applyWorldAction(next, { type: 'SETTLE_AUCTION', parcelId });
  return { state: next, parcelId, price: lot.minPrice };
}

describe('銀行週期與閒置利息', () => {
  it('什麼都不做，推進稅務週期仍讓閒置現金計息', () => {
    const state = createInitialWorld({ mapWidth: 2, mapHeight: 2, startingCash: 100_000 });
    const next = applyWorldAction(state, { type: 'ADVANCE_TAX_TICK' });

    expect(next.bank['player-1'].savingsPrincipal).toBe(0);
    expect(next.bank['player-1'].lastSettlement?.idleInterest).toBe(500);
    expect(next.players['player-1'].cash).toBe(100_500);
    expect(next.financeTick).toBe(1);
    expect(next.taxTick).toBe(1);
  });

  it('只推進銀行週期不扣土地稅，方便把利息和稅拆開驗證', () => {
    const { state } = ownParcel(createInitialWorld({ startingCash: 100_000 }), 0, 0);
    const next = applyWorldAction(state, { type: 'ADVANCE_FINANCE_TICK' });
    expect(next.taxTick).toBe(0);
    const interest = Math.floor((state.players['player-1'].cash * 50) / 10_000);
    expect(next.players['player-1'].cash).toBe(state.players['player-1'].cash + interest);
  });

  it('持有土地時先扣稅，再對剩餘閒置現金計息', () => {
    const { state, price } = ownParcel(createInitialWorld({ startingCash: 100_000 }), 0, 0);
    const next = applyWorldAction(state, { type: 'ADVANCE_TAX_TICK' });
    const afterTax = 100_000 - price - 500;
    const interest = Math.floor((afterTax * 50) / 10_000);
    expect(next.players['player-1'].cash).toBe(afterTax + interest);
    expect(previewCoupledWeek(state).cashAfter).toBe(next.players['player-1'].cash);
  });

  it('現金為 0 時利息不會憑空產生', () => {
    let state = createInitialWorld({ startingCash: 0, mapWidth: 1, mapHeight: 1 });
    state = applyWorldAction(state, { type: 'ADVANCE_TAX_TICK' });
    expect(state.players['player-1'].cash).toBe(0);
  });
});

describe('定期存款', () => {
  it('鎖定期內只計定期利息，不重複吃閒置利息', () => {
    let state = createInitialWorld({ startingCash: 100_000 });
    state = applyWorldAction(state, { type: 'OPEN_SAVINGS', amount: 100_000 });
    expect(state.players['player-1'].cash).toBe(0);

    state = applyWorldAction(state, { type: 'ADVANCE_FINANCE_TICK' });
    expect(state.players['player-1'].cash).toBe(0);
    expect(state.bank['player-1'].savingsAccrued).toBe(1_200);
    expect(state.bank['player-1'].lastSettlement?.idleInterest).toBe(0);
  });

  it('提前解約只退本金', () => {
    let state = createInitialWorld({ startingCash: 50_000 });
    state = applyWorldAction(state, { type: 'OPEN_SAVINGS', amount: 10_000 });
    state = applyWorldAction(state, { type: 'ADVANCE_FINANCE_TICK' });
    expect(state.bank['player-1'].savingsAccrued).toBe(120);

    state = applyWorldAction(state, { type: 'WITHDRAW_SAVINGS' });
    expect(state.bank['player-1'].savingsPrincipal).toBe(0);
    expect(state.bank['player-1'].savingsAccrued).toBe(0);
    expect(state.players['player-1'].cash).toBe(50_200);
  });

  it('滿四期自動撥回本利和', () => {
    let state = createInitialWorld({ startingCash: 10_000 });
    state = applyWorldAction(state, { type: 'OPEN_SAVINGS', amount: 10_000 });
    for (let i = 0; i < 4; i += 1) {
      state = applyWorldAction(state, { type: 'ADVANCE_FINANCE_TICK' });
    }
    expect(state.financeTick).toBe(4);
    expect(state.bank['player-1'].savingsPrincipal).toBe(0);
    expect(state.players['player-1'].cash).toBe(10_480);
    expect(state.bank['player-1'].lastSettlement?.savingsPayout).toBe(10_480);
  });

  it('現金不足或已有定期時，存款動作不改變狀態', () => {
    const state = createInitialWorld({ startingCash: 500 });
    expect(applyWorldAction(state, { type: 'OPEN_SAVINGS', amount: 1_000 })).toBe(state);
    const saved = applyWorldAction(createInitialWorld({ startingCash: 20_000 }), {
      type: 'OPEN_SAVINGS',
      amount: 5_000,
    });
    expect(applyWorldAction(saved, { type: 'OPEN_SAVINGS', amount: 5_000 })).toBe(saved);
  });
});

describe('貸款與建設融資', () => {
  it('借來閒置一整期後，淨值低於不借款', () => {
    const idle = applyWorldAction(createInitialWorld({ startingCash: 100_000 }), {
      type: 'ADVANCE_FINANCE_TICK',
    });
    let leveraged = applyWorldAction(createInitialWorld({ startingCash: 100_000 }), {
      type: 'DRAW_LOAN',
      productId: 'construction',
      amount: 20_000,
    });
    expect(summarizeBank(leveraged).netWorth).toBe(100_000);
    leveraged = applyWorldAction(leveraged, { type: 'ADVANCE_FINANCE_TICK' });
    expect(summarizeBank(leveraged).netWorth).toBeLessThan(summarizeBank(idle).netWorth);
    expect(leveraged.players['player-1'].cash).toBe(117_645);
    expect(summarizeBank(leveraged).debtPrincipal).toBe(17_500);
  });

  it('現金不夠付息時轉入積欠並凍結新貸款', () => {
    let state = applyWorldAction(createInitialWorld({ startingCash: 1_000 }), {
      type: 'DRAW_LOAN',
      productId: 'construction',
      amount: 8_000,
    });
    state = {
      ...state,
      players: {
        ...state.players,
        'player-1': { ...state.players['player-1'], cash: 50 },
      },
    };
    state = applyWorldAction(state, { type: 'ADVANCE_FINANCE_TICK' });
    const loan = state.bank['player-1'].loans[0]!;
    expect(loan.arrears).toBe(1_126);
    expect(loan.principal).toBe(7_000);
    expect(summarizeBank(state).creditFrozen).toBe(true);
    expect(
      applyWorldAction(state, { type: 'DRAW_LOAN', productId: 'working-capital', amount: 1_000 }),
    ).toBe(state);

    state = {
      ...state,
      players: {
        ...state.players,
        'player-1': { ...state.players['player-1'], cash: 1_126 },
      },
    };
    state = applyWorldAction(state, { type: 'REPAY_LOAN', loanId: loan.id, amount: 1_126 });
    expect(summarizeBank(state).creditFrozen).toBe(false);
    expect(summarizeBank(state).debtArrears).toBe(0);
  });

  it('建設融資撥入的現金可以蓋小型工坊', () => {
    let broke = createInitialWorld({ startingCash: 1_000 });
    const owned = ownParcel(
      applyWorldAction(broke, { type: 'DRAW_LOAN', productId: 'construction', amount: 8_000 }),
      0,
      0,
    );
    const state = applyWorldAction(owned.state, {
      type: 'START_BUILD',
      parcelId: owned.parcelId,
      factoryTypeId: 'workshop',
    });
    expect(getSite(state, owned.parcelId)?.phase).toBe('constructing');
    expect(state.players['player-1'].cash).toBe(
      9_000 - owned.price - FACTORY_TYPES.workshop.buildCost,
    );

    broke = ownParcel(createInitialWorld({ startingCash: 1_000 }), 0, 0).state;
    const parcelId = parcelIdFromCoords(0, 0);
    const untouched = applyWorldAction(broke, {
      type: 'START_BUILD',
      parcelId,
      factoryTypeId: 'workshop',
    });
    expect(untouched).toBe(broke);
  });

  it('持有土地與定期會提高授信', () => {
    let state = createInitialWorld({ startingCash: 100_000 });
    expect(summarizeBank(state).creditLimit).toBe(20_000);
    state = ownParcel(state, 1, 1).state;
    state = applyWorldAction(state, { type: 'OPEN_SAVINGS', amount: 10_000 });
    expect(summarizeBank(state).creditLimit).toBe(20_000 + 3_000 + 5_000);
  });
});

describe('股票與大宗', () => {
  it('股票價格隨銀行週期改變，買賣走市價', () => {
    expect(formatBps(50)).toBe('0.50%');
    expect(quoteStock('IRON', 0)).toBe(68);
    expect(quoteStock('IRON', 4)).toBe(90);
    expect(quoteStockSeries('IRON', 0)).toEqual([68]);
    expect(quoteStockSeries('IRON', 4)).toEqual([68, 74, 78, 83, 90]);
    expect(quoteStockSeries('IRON', 10)).toEqual([
      quoteStock('IRON', 3),
      quoteStock('IRON', 4),
      quoteStock('IRON', 5),
      quoteStock('IRON', 6),
      quoteStock('IRON', 7),
      quoteStock('IRON', 8),
      quoteStock('IRON', 9),
      quoteStock('IRON', 10),
    ]);
    expect(quoteStockSeries('TOOL', -3)).toEqual([quoteStock('TOOL', 0)]);

    let state = applyWorldAction(createInitialWorld({ startingCash: 10_000 }), {
      type: 'BUY_STOCK',
      symbol: 'IRON',
      shares: 10,
    });
    expect(state.players['player-1'].cash).toBe(10_000 - 680);
    for (let i = 0; i < 4; i += 1) {
      state = applyWorldAction(state, { type: 'ADVANCE_FINANCE_TICK' });
    }
    const beforeSell = state.players['player-1'].cash;
    state = applyWorldAction(state, { type: 'SELL_STOCK', symbol: 'IRON', shares: 10 });
    expect(state.players['player-1'].cash).toBe(beforeSell + 900);
    expect(state.bank['player-1'].stocks).toHaveLength(0);
  });

  it('大宗同週轉手必虧，跨到較高買價才有機會獲利', () => {
    const ask0 = quoteCommodityAsk('copper', 0);
    const bid0 = quoteCommodityBid(ask0, 400);
    expect(ask0).toBe(39);
    expect(bid0).toBe(37);

    let flipped = applyWorldAction(createInitialWorld({ startingCash: 5_000 }), {
      type: 'BUY_COMMODITY',
      commodityId: 'copper',
      lots: 1,
    });
    flipped = applyWorldAction(flipped, { type: 'SELL_COMMODITY', commodityId: 'copper', lots: 1 });
    expect(flipped.players['player-1'].cash).toBe(5_000 - 20);

    let held = applyWorldAction(createInitialWorld({ startingCash: 5_000 }), {
      type: 'BUY_COMMODITY',
      commodityId: 'copper',
      lots: 1,
    });
    for (let i = 0; i < 3; i += 1) {
      held = applyWorldAction(held, { type: 'ADVANCE_FINANCE_TICK' });
    }
    expect(quoteCommodityAsk('copper', held.financeTick)).toBe(45);
    const cashBefore = held.players['player-1'].cash;
    held = applyWorldAction(held, { type: 'SELL_COMMODITY', commodityId: 'copper', lots: 1 });
    expect(held.players['player-1'].cash).toBe(cashBefore + 430);
  });

  it('超賣或現金不足時不改狀態', () => {
    const state = createInitialWorld({ startingCash: 10 });
    expect(applyWorldAction(state, { type: 'BUY_STOCK', symbol: 'TOOL', shares: 1 })).toBe(state);
    expect(applyWorldAction(state, { type: 'SELL_COMMODITY', commodityId: 'coal', lots: 1 })).toBe(
      state,
    );
  });
});
