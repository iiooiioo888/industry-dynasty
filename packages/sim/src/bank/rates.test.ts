import { describe, expect, it } from 'vitest';
import { applyWorldAction } from '../world/reducer.js';
import { createInitialWorld } from '../world/create-world.js';
import { LOAN_PRODUCTS } from './catalog.js';
import { DEFAULT_BANK_CONFIG } from './config.js';
import { getPlayerBank, summarizeBank } from './logic.js';
import { bondPrice, quoteBond, quoteRates } from './rates.js';

describe('現代利率', () => {
  it('第 0 期年化 2.00%，每期利率對上現有存貸款', () => {
    const rates = quoteRates(0);
    expect(rates.policyAnnualBps).toBe(200);
    expect(rates.idleBps).toBe(DEFAULT_BANK_CONFIG.idleInterestBps);
    expect(rates.savingsBps).toBe(DEFAULT_BANK_CONFIG.savingsInterestBps);
    expect(rates.constructionBps).toBe(LOAN_PRODUCTS.construction.rateBps);
    expect(rates.workingCapitalBps).toBe(LOAN_PRODUCTS['working-capital'].rateBps);
    expect(rates.realAnnualBps).toBe(rates.policyAnnualBps - rates.inflationAnnualBps);
  });

  it('滿一年後政策利率升息，殖利率上升則公債變便宜', () => {
    expect(quoteRates(4).policyAnnualBps).toBeGreaterThan(quoteRates(0).policyAnnualBps);
    const cheap = bondPrice(1_000, 60, 8, 60);
    const dear = bondPrice(1_000, 60, 8, 120);
    expect(dear).toBeLessThan(cheap);
    const issued = quoteBond('note', 0);
    const marked = quoteBond('note', 4, issued.periodsLeft, issued.couponBps);
    expect(marked.price).toBeLessThan(issued.price);
  });

  it('買進公債後每期領息，到期拿回面額', () => {
    let state = createInitialWorld({ startingCash: 20_000 });
    const price = quoteBond('bill', 0).price;
    state = applyWorldAction(state, { type: 'BUY_BOND', bondId: 'bill', units: 2 });
    expect(state.players[state.localPlayerId]!.cash).toBe(20_000 - price * 2);
    expect(summarizeBank(state).bondValue).toBeGreaterThan(0);
    state = applyWorldAction(state, { type: 'ADVANCE_FINANCE_TICK' });
    const holding = getPlayerBank(state, state.localPlayerId).bonds[0]!;
    expect(holding.periodsLeft).toBe(3);
    expect(state.bank[state.localPlayerId]!.lastSettlement?.bondCoupon).toBeGreaterThan(0);
    for (let step = 0; step < 3; step += 1) {
      state = applyWorldAction(state, { type: 'ADVANCE_FINANCE_TICK' });
    }
    expect(getPlayerBank(state, state.localPlayerId).bonds).toHaveLength(0);
    expect(state.bank[state.localPlayerId]!.lastSettlement?.bondRedemption).toBe(2_000);
  });
});
