/** 模擬時鐘。移動與產線階段只吃這份時間，不吃牆鐘動畫。 */
export const SIM_MS_PER_TICK = 1000;

export const CLOCK_SPEEDS = [1, 2, 4] as const;

export type ClockSpeed = (typeof CLOCK_SPEEDS)[number];

export interface SimClock {
  readonly paused: boolean;
  readonly speed: ClockSpeed;
  /** 累積模擬毫秒。暫停時凍結；倍率只影響它增加的速度。 */
  readonly simMs: number;
}

export function initialSimClock(): SimClock {
  return { paused: false, speed: 1, simMs: 0 };
}

export function isClockSpeed(value: number): value is ClockSpeed {
  return (CLOCK_SPEEDS as readonly number[]).includes(value);
}
