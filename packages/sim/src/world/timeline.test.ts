import { describe, expect, it } from 'vitest';
import { FACTORY_TYPES } from '../buildings/catalog.js';
import { SIM_MS_PER_TICK, SIM_TICKS_PER_DAY, ticksUntilDayClose } from './clock.js';
import { createInitialWorld } from './create-world.js';
import { quoteParcelPlan } from './parcel-plan.js';
import { applyWorldAction } from './reducer.js';
import { findOpenLotForParcel, getSite } from './state.js';

describe('一條規劃時間', () => {
  it('建造跟著模擬時鐘，暫停就停工', () => {
    let state = createInitialWorld({ startingCash: 200_000 });
    const parcel = state.map.parcels.find((item) => item.role === 'land' && item.x > 0)!;
    const parcelId = parcel.id;
    const lot = findOpenLotForParcel(state, parcelId)!;
    state = applyWorldAction(state, { type: 'BID', parcelId, amount: lot.minPrice });
    state = applyWorldAction(state, { type: 'SETTLE_AUCTION', parcelId });
    state = applyWorldAction(state, {
      type: 'START_BUILD',
      parcelId,
      factoryTypeId: 'workshop',
    });

    const paused = applyWorldAction(state, { type: 'SET_CLOCK', paused: true });
    const frozen = applyWorldAction(paused, {
      type: 'ADVANCE_SIM_TIME',
      deltaMs: SIM_MS_PER_TICK * 10,
    });
    expect(frozen).toBe(paused);
    expect(getSite(frozen, parcelId)?.phase).toBe('constructing');

    state = applyWorldAction(state, { type: 'SET_CLOCK', paused: false });
    for (let step = 0; step < FACTORY_TYPES.workshop.buildTimeTicks; step += 1) {
      state = applyWorldAction(state, { type: 'ADVANCE_SIM_TIME', deltaMs: SIM_MS_PER_TICK });
    }
    expect(getSite(state, parcelId)?.phase).toBe('complete');
  });

  it('跨過日界只日結一次，倒數在日界後重新算滿', () => {
    let state = createInitialWorld();
    expect(ticksUntilDayClose(0)).toBe(SIM_TICKS_PER_DAY);
    expect(state.gameDay).toBe(0);
    expect(state.financeTick).toBe(0);

    for (let step = 0; step < SIM_TICKS_PER_DAY; step += 1) {
      state = applyWorldAction(state, { type: 'ADVANCE_SIM_TIME', deltaMs: SIM_MS_PER_TICK });
    }
    expect(state.gameDay).toBe(1);
    expect(state.taxTick).toBe(1);
    expect(state.financeTick).toBe(1);
    expect(ticksUntilDayClose(state.clock.simMs)).toBe(SIM_TICKS_PER_DAY);

    state = applyWorldAction(state, { type: 'ADVANCE_SIM_TIME', deltaMs: SIM_MS_PER_TICK });
    expect(state.gameDay).toBe(1);
    expect(state.financeTick).toBe(1);
  });

  it('買地報價同時給到港、樞紐路程、運費與土地稅', () => {
    const state = createInitialWorld();
    const nearPort = state.map.parcels.find((parcel) => parcel.x === 14 && parcel.y === 10)!;
    const far = state.map.parcels.find((parcel) => parcel.x === 0 && parcel.y === 1)!;
    const nearQuote = quoteParcelPlan(state, nearPort);
    const farQuote = quoteParcelPlan(state, far);
    expect(nearQuote.portDistance).toBeLessThan(farQuote.portDistance);
    expect(farQuote.hubSteps).toBeLessThan(nearQuote.hubSteps);
    expect(nearQuote.freightPerUnit).toBeLessThan(farQuote.freightPerUnit);
    expect(nearQuote.landTax).toBe(500);
    expect(nearQuote.populationDensity).toBe(nearPort.populationDensity);
  });
});
