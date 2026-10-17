/** 模擬時鐘。移動、建造、出貨與日結只吃這份時間，不吃牆鐘動畫。 */
export const SIM_MS_PER_TICK = 1000;

/** 一個規劃日的刻數。跨過日界就結算土地稅、銀行與維護，只此一次。 */
export const SIM_TICKS_PER_DAY = 48;

export const CLOCK_SPEEDS = [1, 2, 4] as const;

export type ClockSpeed = (typeof CLOCK_SPEEDS)[number];

export interface SimClock {
  readonly paused: boolean;
  readonly speed: ClockSpeed;
  /** 累積模擬毫秒。暫停時凍結；倍率只影響它增加的速度。 */
  readonly simMs: number;
  /**
   * 已自動日結到第幾個日界。缺省視為 0，舊狀態不會在載入時補結。
   * 0 表示尚未跨過第一個日界。
   */
  readonly settledDayIndex?: number;
}

export function initialSimClock(): SimClock {
  return { paused: false, speed: 1, simMs: 0, settledDayIndex: 0 };
}

export function dayLengthMs(): number {
  return SIM_MS_PER_TICK * SIM_TICKS_PER_DAY;
}

export function dayIndexAt(simMs: number): number {
  if (!Number.isFinite(simMs) || simMs <= 0) {
    return 0;
  }
  return Math.floor(simMs / dayLengthMs());
}

/** 距下一次日結的模擬毫秒。正好在日界上時，倒數下一個完整日。 */
export function msUntilDayClose(simMs: number): number {
  const day = dayLengthMs();
  const safe = Number.isFinite(simMs) && simMs > 0 ? simMs : 0;
  const into = safe % day;
  return into === 0 ? day : day - into;
}

export function ticksUntilDayClose(simMs: number): number {
  return Math.ceil(msUntilDayClose(simMs) / SIM_MS_PER_TICK);
}

export function isClockSpeed(value: number): value is ClockSpeed {
  return (CLOCK_SPEEDS as readonly number[]).includes(value);
}
