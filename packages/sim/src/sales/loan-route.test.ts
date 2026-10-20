import { describe, expect, it } from 'vitest';
import { emptyPnL } from './pnl.js';
import { createScenarioState, evaluateScenario, scenarioProgress } from './scenario.js';
import { BALANCE } from '../balance/targets.js';

describe('還款路線', () => {
  const pnl = { ...emptyPnL(), revenue: BALANCE.targetNetProfit + 1 };

  it('淨利達標 + 累計清償達標 + 零負債 → 通關', () => {
    const s = evaluateScenario(createScenarioState(), BALANCE.maxDays - 1, pnl, {
      craftedValue: 0,
      debtRepaid: BALANCE.targetDebtRepaid,
      outstandingDebt: 0,
    });
    expect(s.status).toBe('won');
  });

  it('借了又還清但沒獲利 → 不成立（避免套利）', () => {
    const s = evaluateScenario(createScenarioState(), BALANCE.maxDays - 1, emptyPnL(), {
      craftedValue: 0,
      debtRepaid: 999_999,
      outstandingDebt: 0,
    });
    expect(s.status).toBe('playing');
  });

  it('清償達標但仍有負債 → 不成立', () => {
    const s = evaluateScenario(createScenarioState(), BALANCE.maxDays - 1, pnl, {
      craftedValue: 0,
      debtRepaid: 999_999,
      outstandingDebt: 1,
    });
    expect(s.status).toBe('playing');
  });

  it('清償未達標 → 不成立', () => {
    const s = evaluateScenario(createScenarioState(), BALANCE.maxDays - 1, pnl, {
      craftedValue: 0,
      debtRepaid: BALANCE.targetDebtRepaid - 1,
      outstandingDebt: 0,
    });
    expect(s.status).toBe('playing');
  });

  it('進度查詢能分別回報三個條件', () => {
    const p = scenarioProgress(createScenarioState(), pnl, {
      craftedValue: 0,
      debtRepaid: 12_345,
      outstandingDebt: 5_000,
    });
    expect(p.profitMet).toBe(true);
    expect(p.repaidMet).toBe(false);
    expect(p.debtClear).toBe(false);
    expect(p.won).toBe(false);
  });
});
