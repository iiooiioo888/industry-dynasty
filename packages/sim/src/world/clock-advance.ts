import { SIM_MS_PER_TICK, type ClockSpeed } from './clock.js';
import { applyProductionTick } from './production-reducer.js';
import type { WorldState } from './state.js';

/** 分頁切走時最多補算的產線刻數，避免一次灌進好幾分鐘。 */
export const MAX_SIM_TICKS_PER_ADVANCE = 30;

function hasLiveProduction(state: WorldState): boolean {
  return Object.values(state.productionLines).some((line) => line.status !== 'stopped');
}

/**
 * 牆鐘增量 × 倍率 → 模擬時間。
 * 每跨過一個 tick，正在跑的產線才前進一格：趕路消耗時間，抵達後才進入作業。
 * 暫停時原樣返回。
 */
export function advanceSimClock(state: WorldState, deltaMs: number): WorldState {
  if (state.clock.paused || !Number.isFinite(deltaMs) || deltaMs <= 0) {
    return state;
  }

  const gained = deltaMs * state.clock.speed;
  const target = state.clock.simMs + gained;
  if (!hasLiveProduction(state)) {
    return {
      ...state,
      clock: { ...state.clock, simMs: target },
    };
  }

  const startTick = Math.floor(state.clock.simMs / SIM_MS_PER_TICK);
  const endTick = Math.floor(target / SIM_MS_PER_TICK);
  const crossed = Math.min(MAX_SIM_TICKS_PER_ADVANCE, Math.max(0, endTick - startTick));
  let next = state;
  for (let step = 1; step <= crossed; step += 1) {
    if (!hasLiveProduction(next)) {
      break;
    }
    const boundary = (startTick + step) * SIM_MS_PER_TICK;
    next = applyProductionTick({
      ...next,
      clock: { ...next.clock, simMs: boundary },
    });
  }

  const droppedBacklog = endTick - startTick > crossed;
  return {
    ...next,
    clock: {
      ...next.clock,
      simMs: droppedBacklog ? (startTick + crossed) * SIM_MS_PER_TICK : target,
    },
  };
}

/** 手動推進正好一格模擬時間，暫停中也生效，供單步與既有測試使用。 */
export function stepOneSimTick(state: WorldState): WorldState {
  const simMs = state.clock.simMs + SIM_MS_PER_TICK;
  return applyProductionTick({
    ...state,
    clock: { ...state.clock, simMs },
  });
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
