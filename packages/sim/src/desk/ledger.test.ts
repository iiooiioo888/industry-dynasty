import { describe, expect, it } from 'vitest';
import { interestOn } from '../bank/quotes.js';
import { nextLoanDue, settleFinancePeriod, summarizeBank } from '../bank/logic.js';
import { LOAN_PRODUCTS } from '../bank/catalog.js';
import { applyWorldAction } from '../world/reducer.js';
import { createInitialWorld } from '../world/create-world.js';
import { quoteCashPlan, quoteDesk } from './ledger.js';

describe('帳冊與銀行數據', () => {
  it('沒有土地與員工時，日支出為 0', () => {
    const plan = quoteCashPlan(createInitialWorld());
    expect(plan.burn).toBe(0);
    expect(plan.runwayDays).toBeNull();
  });

  it('持有土地會計入土地稅，貸款會計入下期應繳', () => {
    let state = createInitialWorld({ startingCash: 80_000 });
    const parcel = state.map.parcels.find((item) => item.role === 'land')!;
    const lot = state.auctionLots.find((item) => item.parcelId.value === parcel.id.value)!;
    state = applyWorldAction(state, { type: 'BID', parcelId: parcel.id, amount: lot.minPrice });
    state = applyWorldAction(state, { type: 'SETTLE_AUCTION', parcelId: parcel.id });
    state = applyWorldAction(state, {
      type: 'DRAW_LOAN',
      productId: 'working-capital',
      amount: 4_000,
    });
    const loan = state.bank[state.localPlayerId]!.loans[0]!;
    const due = nextLoanDue(loan);
    expect(due.interest).toBe(interestOn(4_000, LOAN_PRODUCTS['working-capital'].rateBps));
    expect(due.principal).toBeGreaterThan(0);
    const plan = quoteCashPlan(state);
    expect(plan.landTax).toBeGreaterThan(0);
    expect(plan.loanDue).toBe(due.total);
  });

  it('架上存貨計入淨值，結算會留下對帳', () => {
    const state = createInitialWorld();
    const withShelf = {
      ...state,
      commerce: {
        ...state.commerce!,
        shelves: [{ parcelId: 'missing', itemId: 'hand-tool' as const, unitPrice: 10, quantity: 2 }],
      },
      sites: {
        missing: {
          phase: 'complete' as const,
          factoryTypeId: 'storefront' as const,
          ownerId: state.localPlayerId,
          buildingId: 'store-1',
        },
      },
    };
    expect(summarizeBank(withShelf).shelfValue).toBeGreaterThan(0);
    expect(summarizeBank(withShelf).netWorth).toBeGreaterThan(summarizeBank(state).netWorth);

    const settled = settleFinancePeriod(state);
    expect(settled.bank[state.localPlayerId]?.statements).toHaveLength(1);
    expect(settled.bank[state.localPlayerId]?.statements[0]?.idleInterest).toBeGreaterThan(0);
    const desk = quoteDesk(settled);
    expect(desk.cities.length).toBe(state.map.cities.length);
    expect(desk.openContracts).toBeGreaterThan(0);
  });
});
