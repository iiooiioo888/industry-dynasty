import { describe, expect, it } from 'vitest';
import { applyWorldAction } from '../world/reducer.js';
import { createInitialWorld } from '../world/create-world.js';
import { indexHistory, marketSeries, quoteBoard, quoteIndex } from './exchange.js';
import { getPlayerBank } from './logic.js';

describe('金融市場', () => {
  it('指數有漲跌，運費新聞會抬高港埠賣價', () => {
    const calm = quoteIndex(3);
    expect(calm.level).toBeGreaterThan(0);
    const plain = quoteBoard('PORT', 2);
    const shocked = quoteBoard('PORT', 2, [
      {
        id: 'evt',
        kind: 'freight-up',
        headline: '港灣裝卸壅塞，運費短升',
        remainingDays: 2,
        magnitude: 1.25,
      },
    ]);
    expect(shocked.ask).toBeGreaterThan(plain.ask);
    expect(quoteBoard('IRON', 2).bid).toBeLessThan(quoteBoard('IRON', 2).ask);
  });

  it('走勢停在本期，新聞只改最後一點', () => {
    expect(marketSeries('IRON', 0).map((point) => point.tick)).toEqual([0]);
    expect(marketSeries('IRON', 0)[0]?.value).toBe(quoteBoard('IRON', 0).mid);
    const calm = marketSeries('PORT', 3);
    expect(calm.map((point) => point.tick)).toEqual([0, 1, 2, 3]);
    expect(calm[3]?.value).toBe(quoteBoard('PORT', 3).mid);
    const shocked = marketSeries('PORT', 3, [
      {
        id: 'evt',
        kind: 'freight-up',
        headline: '港灣裝卸壅塞，運費短升',
        remainingDays: 2,
        magnitude: 1.25,
      },
    ]);
    expect(shocked[2]?.value).toBe(calm[2]?.value);
    expect(shocked[3]?.value).toBeGreaterThan(calm[3]!.value);
    const history = indexHistory(40);
    expect(history).toHaveLength(32);
    expect(history[0]?.tick).toBe(9);
    expect(history[31]?.value).toBe(quoteIndex(40).level);
  });

  it('高於賣價的買單在下一期成交，並退回價差', () => {
    let state = createInitialWorld({ startingCash: 50_000 });
    const ask = quoteBoard('GRID', state.financeTick).ask;
    const before = state.players[state.localPlayerId]!.cash;
    state = applyWorldAction(state, {
      type: 'PLACE_LIMIT',
      marketId: 'GRID',
      side: 'buy',
      limitPrice: ask * 3,
      quantity: 4,
    });
    const locked = before - state.players[state.localPlayerId]!.cash;
    expect(locked).toBe(ask * 3 * 4);
    expect(getPlayerBank(state, state.localPlayerId).orders).toHaveLength(1);
    state = applyWorldAction(state, { type: 'ADVANCE_FINANCE_TICK' });
    const book = getPlayerBank(state, state.localPlayerId);
    expect(book.orders).toHaveLength(0);
    expect(book.stocks.find((holding) => holding.symbol === 'GRID')?.shares).toBe(4);
    expect(book.fills[0]?.side).toBe('buy');
    expect(state.players[state.localPlayerId]!.cash).toBeGreaterThan(before - locked);
  });

  it('低於賣價的買單留在簿上，撤單退回圈存', () => {
    let state = createInitialWorld({ startingCash: 20_000 });
    state = applyWorldAction(state, {
      type: 'PLACE_LIMIT',
      marketId: 'TOOL',
      side: 'buy',
      limitPrice: 1,
      quantity: 2,
    });
    const id = getPlayerBank(state, state.localPlayerId).orders[0]!.id;
    state = applyWorldAction(state, { type: 'ADVANCE_FINANCE_TICK' });
    expect(getPlayerBank(state, state.localPlayerId).orders).toHaveLength(1);
    const parked = state.players[state.localPlayerId]!.cash;
    state = applyWorldAction(state, { type: 'CANCEL_LIMIT', orderId: id });
    expect(getPlayerBank(state, state.localPlayerId).orders).toHaveLength(0);
    expect(state.players[state.localPlayerId]!.cash).toBe(parked + 2);
  });

  it('賣單在買價高於限價時出清持股', () => {
    let state = createInitialWorld({ startingCash: 50_000 });
    state = applyWorldAction(state, { type: 'BUY_STOCK', symbol: 'IRON', shares: 6 });
    const owned = state.players[state.localPlayerId]!.cash;
    state = applyWorldAction(state, {
      type: 'PLACE_LIMIT',
      marketId: 'IRON',
      side: 'sell',
      limitPrice: 1,
      quantity: 6,
    });
    expect(state.players[state.localPlayerId]!.cash).toBe(owned);
    state = applyWorldAction(state, { type: 'ADVANCE_FINANCE_TICK' });
    const book = getPlayerBank(state, state.localPlayerId);
    expect(book.stocks.find((holding) => holding.symbol === 'IRON')).toBeUndefined();
    expect(book.fills[0]?.side).toBe('sell');
    expect(state.players[state.localPlayerId]!.cash).toBeGreaterThan(owned);
  });
});
