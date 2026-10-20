import { accrueResearch } from '../company/research.js';
import { dayIndexAt, SIM_MS_PER_TICK, type ClockSpeed } from './clock.js';
import { applyBuildTick } from './build-reducer.js';
import { applyProductionTick } from './production-reducer.js';
import { applyAdvanceDay } from './sales-reducer.js';
import { settleArrivedShipments } from './shipments.js';
import { DEFAULT_WORLD_CONFIG, type WorldConfig } from './config.js';
import type { WorldState } from './state.js';

/** 分頁切走時最多補算的產線刻數，避免一次灌進好幾分鐘。 */
export const MAX_SIM_TICKS_PER_ADVANCE = 30;

function hasLiveProduction(state: WorldState): boolean {
  return Object.values(state.productionLines).some((line) => line.status !== 'stopped');
}

function hasConstruction(state: WorldState): boolean {
  return Object.values(state.sites).some((site) => site.phase === 'constructing');
}

/** 模擬時間跨過日界才日結。已結過的日界不會再跳一次。 */
export function catchUpDays(
  state: WorldState,
  config: WorldConfig = DEFAULT_WORLD_CONFIG,
): WorldState {
  const index = dayIndexAt(state.clock.simMs);
  let settled = state.clock.settledDayIndex ?? 0;
  if (settled >= index) {
    return state;
  }
  let next = state;
  while (settled < index) {
    next = applyAdvanceDay(next, config);
    settled += 1;
    next = {
      ...next,
      clock: { ...next.clock, settledDayIndex: settled },
    };
  }
  return next;
}

/**
 * 一格模擬時間：建造、產線、到貨、日結走同一條刻度。
 * 沒有在建工地就不推進建設計數，避免空轉改寫 buildTick。
 */
export function applyOneSimTick(
  state: WorldState,
  boundaryMs: number,
  config: WorldConfig = DEFAULT_WORLD_CONFIG,
): WorldState {
  let next: WorldState = {
    ...state,
    clock: { ...state.clock, simMs: boundaryMs },
  };
  if (hasConstruction(next)) {
    next = applyBuildTick(next);
    next = { ...next, clock: { ...next.clock, simMs: boundaryMs } };
  }
  if (hasLiveProduction(next)) {
    next = applyProductionTick(next);
  }
  next = accrueResearch(next);
  next = settleArrivedShipments(next);
  return catchUpDays(next, config);
}

/**
 * 牆鐘增量 × 倍率 → 模擬時間。
 * 每跨過一個 tick，建造與正在跑的產線才前進一格。暫停時原樣返回。
 */
export function advanceSimClock(
  state: WorldState,
  deltaMs: number,
  config: WorldConfig = DEFAULT_WORLD_CONFIG,
): WorldState {
  if (state.clock.paused || !Number.isFinite(deltaMs) || deltaMs <= 0) {
    return state;
  }

  const gained = deltaMs * state.clock.speed;
  const target = state.clock.simMs + gained;
  const startTick = Math.floor(state.clock.simMs / SIM_MS_PER_TICK);
  const endTick = Math.floor(target / SIM_MS_PER_TICK);
  const crossed = Math.min(MAX_SIM_TICKS_PER_ADVANCE, Math.max(0, endTick - startTick));

  let next = state;
  for (let step = 1; step <= crossed; step += 1) {
    const boundary = (startTick + step) * SIM_MS_PER_TICK;
    next = applyOneSimTick(next, boundary, config);
  }

  const droppedBacklog = endTick - startTick > crossed;
  const simMs = droppedBacklog ? (startTick + crossed) * SIM_MS_PER_TICK : target;
  if (simMs !== next.clock.simMs) {
    next = { ...next, clock: { ...next.clock, simMs } };
  }
  return settleArrivedShipments(next);
}

/** 手動推進正好一格模擬時間，暫停中也生效，供單步與既有測試使用。 */
export function stepOneSimTick(
  state: WorldState,
  config: WorldConfig = DEFAULT_WORLD_CONFIG,
): WorldState {
  return applyOneSimTick(state, state.clock.simMs + SIM_MS_PER_TICK, config);
}

export function setSimClock(
  state: WorldState,
  patch: { readonly paused?: boolean; readonly speed?: ClockSpeed },
): WorldState {
  const paused = patch.paused ?? state.clock.paused;
  const speed = patch.speed ?? state.clock.speed;
  if (paused === state.clock.paused && speed === state.clock.speed) {
    return state;
  }
  return {
    ...state,
    clock: { ...state.clock, paused, speed },
  };
}
