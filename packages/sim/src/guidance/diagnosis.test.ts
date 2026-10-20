import { describe, expect, it } from 'vitest';
import { diagnoseLoss } from './diagnosis.js';
import { createInitialWorld } from '../world/create-world.js';
import { applyWorldAction } from '../world/reducer.js';
import { findOpenLotForParcel } from '../world/state.js';
import { addPnL, emptyPnL } from '../sales/pnl.js';
import { createScenarioState } from '../sales/scenario.js';
import type { WorldState } from '../world/state.js';

/**
 * 敗因診斷。
 *
 * 原則：**只報有證據的原因**。每一條都要有數字支撐，
 * 不能寫「你可能擴張太快」這種沒有依據的話。
 */
function withPnl(state: WorldState, patch: Parameters<typeof addPnL>[1]): WorldState {
  const playerId = state.localPlayerId;
  return { ...state, pnl: { ...state.pnl, [playerId]: addPnL(emptyPnL(), patch) } };
}

function buildWorkshop(state: WorldState) {
  const parcel = state.map.parcels
    .filter((p) => p.role === 'land' && p.ownerId === null)
    .find((p) => findOpenLotForParcel(state, p.id) !== undefined)!;
  const lot = findOpenLotForParcel(state, parcel.id)!;
  let next = applyWorldAction(state, { type: 'BID', parcelId: parcel.id, amount: lot.minPrice });
  next = applyWorldAction(next, { type: 'SETTLE_AUCTION', parcelId: parcel.id });
  next = applyWorldAction(next, {
    type: 'START_BUILD',
    parcelId: parcel.id,
    factoryTypeId: 'workshop',
  });
  for (let i = 0; i < 40; i += 1) {
    next = applyWorldAction(next, { type: 'ADVANCE_BUILD_TICK' });
  }
  return next;
}

/** 蓋 N 座工坊 —— 用來排除「規模太小」這條診斷。 */
function buildWorkshops(state: WorldState, count: number): WorldState {
  let next = state;
  for (let i = 0; i < count; i += 1) {
    next = buildWorkshop(next);
  }
  return next;
}

describe('敗因診斷', () => {
  it('全新的局：沒有工廠、沒有加工、沒有營收', () => {
    const state = createInitialWorld();
    const reasons = diagnoseLoss({ state, scenario: createScenarioState() });
    const ids = reasons.map((r) => r.id);
    expect(ids).toContain('too-small');
    expect(ids).toContain('no-processing');
    expect(ids).toContain('no-sales');
  });

  it('存在高嚴重度時不會只回「差一點」', () => {
    const state = createInitialWorld();
    const reasons = diagnoseLoss({ state, scenario: createScenarioState() });
    expect(reasons.some((r) => r.id === 'short-of-target')).toBe(false);
  });

  it('結果依嚴重度由高到低排序', () => {
    const state = createInitialWorld();
    const reasons = diagnoseLoss({ state, scenario: createScenarioState() });
    for (let i = 1; i < reasons.length; i += 1) {
      expect(reasons[i - 1]!.severity).toBeGreaterThanOrEqual(reasons[i]!.severity);
    }
  });

  it('產線閒置會被指出來', () => {
    const state = withPnl(createInitialWorld(), { productionIdleLoss: 5_000, revenue: 10_000 });
    const reasons = diagnoseLoss({ state, scenario: createScenarioState() });
    const idle = reasons.find((r) => r.id === 'production-idle');
    expect(idle).toBeDefined();
    expect(idle!.headline).toContain('5,000');
  });

  it('固定成本過高會被指出來', () => {
    const state = withPnl(createInitialWorld(), {
      revenue: 10_000,
      maintenance: 3_000,
      taxPaid: 2_000,
      wages: 1_000,
    });
    const reasons = diagnoseLoss({ state, scenario: createScenarioState() });
    expect(reasons.some((r) => r.id === 'costs-eat-profit')).toBe(true);
  });

  it('欠稅會被指出來', () => {
    const base = createInitialWorld();
    const state: WorldState = {
      ...base,
      unpaidLandTax: { [base.localPlayerId]: 1_200 },
    };
    const reasons = diagnoseLoss({ state, scenario: createScenarioState() });
    const tax = reasons.find((r) => r.id === 'unpaid-tax');
    expect(tax).toBeDefined();
    expect(tax!.headline).toContain('1,200');
  });

  it('沒有技師會被指出來（前提是已有工廠）', () => {
    const state = buildWorkshop(createInitialWorld({ startingCash: 400_000 }));
    const reasons = diagnoseLoss({ state, scenario: createScenarioState() });
    expect(reasons.some((r) => r.id === 'no-staff')).toBe(true);
  });

  it('沒有明顯問題時給出「差一點」並附上數字', () => {
    // 三座工廠才不會觸發「規模太小」，也才測得到「差一點」這條
    let state = buildWorkshops(createInitialWorld({ startingCash: 900_000 }), 3);
    const playerId = state.localPlayerId;
    state = {
      ...state,
      craftedTotals: { ...state.craftedTotals, [playerId]: { 'basic-part': 10 } },
      pnl: { ...state.pnl, [playerId]: addPnL(emptyPnL(), { revenue: 40_000 }) },
      commerce: state.commerce
        ? { ...state.commerce, staff: { ...state.commerce.staff, operators: 2 } }
        : state.commerce,
    };
    const reasons = diagnoseLoss({ state, scenario: createScenarioState() });
    const short = reasons.find((r) => r.id === 'short-of-target');
    expect(short).toBeDefined();
    expect(short!.headline).toContain('30,000');
  });

  it('每一條診斷都有可執行的建議', () => {
    const state = createInitialWorld();
    for (const reason of diagnoseLoss({ state, scenario: createScenarioState() })) {
      expect(reason.hint.length).toBeGreaterThan(10);
      expect(reason.headline.length).toBeGreaterThan(5);
    }
  });
});
