import { describe, expect, it } from 'vitest';
import { FACTORY_TYPES } from '../buildings/catalog.js';
import { parcelIdFromCoords } from '../types/map.js';
import { SUPPLY_HUB } from '../production/logistics.js';
import { SIM_MS_PER_TICK } from './clock.js';
import { MAX_SIM_TICKS_PER_ADVANCE } from './clock-advance.js';
import { createInitialWorld } from './create-world.js';
import { findPath } from './pathfinding.js';
import { applyWorldAction } from './reducer.js';
import { findOpenLotForParcel, getProductionLine } from './state.js';
import { listMapActors } from './workers.js';

function ownAndCompleteFactory(state: ReturnType<typeof createInitialWorld>, x: number, y: number) {
  const parcelId = parcelIdFromCoords(x, y);
  const lot = findOpenLotForParcel(state, parcelId)!;
  let next = applyWorldAction(state, { type: 'BID', parcelId, amount: lot.minPrice });
  next = applyWorldAction(next, { type: 'SETTLE_AUCTION', parcelId });
  next = applyWorldAction(next, {
    type: 'START_BUILD',
    parcelId,
    factoryTypeId: 'workshop',
  });
  for (let i = 0; i < FACTORY_TYPES.workshop.buildTimeTicks; i++) {
    next = applyWorldAction(next, { type: 'ADVANCE_BUILD_TICK' });
  }
  return { state: next, parcelId };
}

function startParts(x: number, y: number) {
  let state = createInitialWorld({ startingCash: 500_000 });
  const ready = ownAndCompleteFactory(state, x, y);
  state = applyWorldAction(ready.state, {
    type: 'START_PRODUCTION',
    parcelId: ready.parcelId,
    recipeId: 'make-basic-part',
  });
  return { state, parcelId: ready.parcelId };
}

describe('模擬時鐘', () => {
  it('暫停時模擬時間與產線都不前進', () => {
    const { state } = startParts(4, 4);
    const paused = applyWorldAction(state, { type: 'SET_CLOCK', paused: true });
    const frozen = applyWorldAction(paused, { type: 'ADVANCE_SIM_TIME', deltaMs: 5_000 });
    expect(frozen).toBe(paused);
    expect(frozen.clock.simMs).toBe(state.clock.simMs);
    expect(getProductionLine(frozen, parcelIdFromCoords(4, 4))!.progressTicks).toBe(0);
  });

  it('倍率按比例消耗模擬時間', () => {
    const slowStart = startParts(4, 4).state;
    const slow = applyWorldAction(slowStart, {
      type: 'ADVANCE_SIM_TIME',
      deltaMs: SIM_MS_PER_TICK,
    });
    const fastStart = applyWorldAction(startParts(4, 4).state, { type: 'SET_CLOCK', speed: 2 });
    const fast = applyWorldAction(fastStart, {
      type: 'ADVANCE_SIM_TIME',
      deltaMs: SIM_MS_PER_TICK,
    });
    expect(getProductionLine(slow, parcelIdFromCoords(4, 4))!.progressTicks).toBe(1);
    expect(getProductionLine(fast, parcelIdFromCoords(4, 4))!.progressTicks).toBe(2);
    expect(fast.clock.simMs - fastStart.clock.simMs).toBe(SIM_MS_PER_TICK * 2);
  });

  it('不足一格的時間只推進位置、不結算產線', () => {
    const { state, parcelId } = startParts(4, 4);
    const mid = applyWorldAction(state, { type: 'ADVANCE_SIM_TIME', deltaMs: SIM_MS_PER_TICK - 1 });
    expect(getProductionLine(mid, parcelId)!.progressTicks).toBe(0);
    expect(mid.clock.simMs).toBe(SIM_MS_PER_TICK - 1);
  });

  it('連續的小增量跨過刻度後才前進，位置不會卡在第一格', () => {
    const started = startParts(4, 4);
    const parcelId = started.parcelId;
    let state = started.state;
    for (let frame = 0; frame < 40; frame += 1) {
      state = applyWorldAction(state, { type: 'ADVANCE_SIM_TIME', deltaMs: 16 });
    }
    const early = listMapActors(state).find((actor) => actor.parcelKey === parcelId.value)!;
    expect(getProductionLine(state, parcelId)!.progressTicks).toBe(0);
    expect(Math.abs(early.x - 4) + Math.abs(early.y - 4)).toBeGreaterThan(0.2);

    for (let frame = 0; frame < 40; frame += 1) {
      state = applyWorldAction(state, { type: 'ADVANCE_SIM_TIME', deltaMs: 16 });
    }
    const later = listMapActors(state).find((actor) => actor.parcelKey === parcelId.value)!;
    expect(getProductionLine(state, parcelId)!.progressTicks).toBe(1);
    expect(Math.abs(later.x - early.x) + Math.abs(later.y - early.y)).toBeGreaterThan(0.4);
  });

  it('一次補算不會超過上限', () => {
    const { state, parcelId } = startParts(4, 4);
    const burst = applyWorldAction(state, {
      type: 'ADVANCE_SIM_TIME',
      deltaMs: SIM_MS_PER_TICK * (MAX_SIM_TICKS_PER_ADVANCE + 25),
    });
    expect(burst.productionTick).toBe(MAX_SIM_TICKS_PER_ADVANCE);
    expect(getProductionLine(burst, parcelId)!.progressTicks).toBeLessThanOrEqual(
      MAX_SIM_TICKS_PER_ADVANCE,
    );
  });
});

describe('工人沿路徑移動', () => {
  it('去供應樞紐的路線會走上道路', () => {
    const state = createInitialWorld();
    const path = findPath(state.map, { x: 4, y: 4 }, { x: SUPPLY_HUB.x, y: SUPPLY_HUB.y });
    const roles = path.map(
      (tile) =>
        state.map.parcels.find((parcel) => parcel.x === tile.x && parcel.y === tile.y)?.role,
    );
    expect(roles).toContain('road');
    expect(path[0]).toEqual({ x: 4, y: 4 });
    expect(path[path.length - 1]).toEqual({ x: SUPPLY_HUB.x, y: SUPPLY_HUB.y });
  });

  it('時間走一半時人在路上，抵達後才進入作業並回到工廠', () => {
    const { state, parcelId } = startParts(4, 4);
    const line = getProductionLine(state, parcelId)!;
    expect(line.travelTicks).toBeGreaterThan(0);
    expect(line.phase).toBe('traveling');

    const moving = applyWorldAction(state, {
      type: 'ADVANCE_SIM_TIME',
      deltaMs: SIM_MS_PER_TICK / 2,
    });
    const actor = listMapActors(moving).find((item) => item.parcelKey === parcelId.value)!;
    expect(actor.activity).toBe('traveling');
    const away = Math.abs(actor.x - 4) + Math.abs(actor.y - 4);
    expect(away).toBeGreaterThan(0.2);

    let stepped = state;
    for (let i = 0; i < line.travelTicks; i += 1) {
      stepped = applyWorldAction(stepped, { type: 'ADVANCE_PRODUCTION_TICK' });
      const current = getProductionLine(stepped, parcelId)!;
      if (i < line.travelTicks - 1) {
        expect(current.phase).toBe('traveling');
      }
    }
    const arrived = getProductionLine(stepped, parcelId)!;
    expect(arrived.phase).toBe('working');
    expect(arrived.progressTicks).toBe(line.travelTicks);
    expect(arrived.completedRuns).toBe(0);
    const home = listMapActors(stepped).find((item) => item.parcelKey === parcelId.value)!;
    expect(home.activity).toBe('working');
    expect(home.leg).toBe('working');
    expect(home.status).toBe('作業');
    expect(Math.abs(home.x - 4) + Math.abs(home.y - 4)).toBeLessThan(0.05);
  });

  it('去程、樞紐、回程分成三段，作業時人留在廠內', () => {
    const { state, parcelId } = startParts(4, 4);
    const line = getProductionLine(state, parcelId)!;
    // 到樞紐的路程仍然很長；生產週期不再把這段路程加進去，
    // 否則遠廠在經濟日模型裡幾乎沒有產出。畫面上的去程被收進週期前段。
    expect(line.workerTravelTicks).toBeGreaterThanOrEqual(5);
    expect(line.cycleTicks).toBeLessThan(line.workerTravelTicks);
    const travelTicks = line.travelTicks;
    expect(travelTicks).toBeGreaterThan(0);
    expect(travelTicks).toBeLessThanOrEqual(line.cycleTicks - 1);

    const at = (fraction: number) =>
      applyWorldAction(state, {
        type: 'ADVANCE_SIM_TIME',
        deltaMs: SIM_MS_PER_TICK * travelTicks * fraction,
      });

    const leaving = listMapActors(at(0.2)).find((item) => item.parcelKey === parcelId.value)!;
    expect(leaving.leg).toBe('outbound');
    expect(leaving.status).toBe('去程');

    const hub = listMapActors(at(0.5)).find((item) => item.parcelKey === parcelId.value)!;
    expect(hub.leg).toBe('hub');
    expect(hub.status).toBe('樞紐');
    expect(Math.abs(hub.x - SUPPLY_HUB.x) + Math.abs(hub.y - SUPPLY_HUB.y)).toBeLessThan(0.05);

    const back = listMapActors(at(0.75)).find((item) => item.parcelKey === parcelId.value)!;
    expect(back.leg).toBe('return');
    expect(back.status).toBe('回程');

    const home = listMapActors(at(1)).find((item) => item.parcelKey === parcelId.value)!;
    expect(home.leg).toBe('working');
    expect(home.activity).toBe('working');
    expect(Math.abs(home.x - 4) + Math.abs(home.y - 4)).toBeLessThan(0.05);
  });

  it('同格的兩名工人會錯開', () => {
    const first = startParts(4, 4);
    const second = ownAndCompleteFactory(first.state, 5, 4);
    let state = applyWorldAction(second.state, {
      type: 'START_PRODUCTION',
      parcelId: second.parcelId,
      recipeId: 'make-basic-part',
    });
    const travel = Math.min(
      getProductionLine(state, first.parcelId)!.travelTicks,
      getProductionLine(state, second.parcelId)!.travelTicks,
    );
    for (let step = 0; step < Math.floor(travel * 0.5); step += 1) {
      state = applyWorldAction(state, { type: 'ADVANCE_PRODUCTION_TICK' });
    }
    const actors = listMapActors(state);
    expect(actors).toHaveLength(2);
    expect(actors.every((actor) => actor.leg === 'hub')).toBe(true);
    const apart =
      Math.abs((actors[0]?.x ?? 0) - (actors[1]?.x ?? 0)) +
      Math.abs((actors[0]?.y ?? 0) - (actors[1]?.y ?? 0));
    expect(apart).toBeGreaterThan(0.2);
  });

  it('待料時停在當下位置，不再跟著時間滑動', () => {
    const { state: started, parcelId } = startParts(4, 4);
    let state = started;
    state = applyWorldAction(state, { type: 'ADVANCE_SIM_TIME', deltaMs: SIM_MS_PER_TICK / 2 });
    const moving = listMapActors(state).find((item) => item.parcelKey === parcelId.value)!;
    const moved = Math.abs(moving.x - 4) + Math.abs(moving.y - 4);
    expect(moved).toBeGreaterThan(0.2);
    state = {
      ...state,
      inventories: { [state.localPlayerId]: {} },
    };
    const waiting = applyWorldAction(state, { type: 'ADVANCE_SIM_TIME', deltaMs: SIM_MS_PER_TICK });
    const before = listMapActors(waiting).find((item) => item.parcelKey === parcelId.value)!;
    expect(Math.abs(before.x - 4) + Math.abs(before.y - 4)).toBeGreaterThanOrEqual(moved - 0.05);
    expect(before.activity).toBe('idle');
    expect(getProductionLine(waiting, parcelId)!.status).toBe('waiting_inputs');
    const later = applyWorldAction(waiting, {
      type: 'ADVANCE_SIM_TIME',
      deltaMs: SIM_MS_PER_TICK / 2,
    });
    const after = listMapActors(later).find((item) => item.parcelKey === parcelId.value)!;
    expect(after.x).toBe(before.x);
    expect(after.y).toBe(before.y);
    expect(after.activity).toBe('idle');
  });
});
