import type { Parcel } from '../types/map.js';

/** 原料供應樞紐（簡化距離起點） */
export const SUPPLY_HUB = { x: 0, y: 0 };

export function manhattanToSupplyHub(parcel: Parcel): number {
  return Math.abs(parcel.x - SUPPLY_HUB.x) + Math.abs(parcel.y - SUPPLY_HUB.y);
}

export interface ProductionTimingView {
  readonly workerTravelTicks: number;
  readonly cycleTicks: number;
  readonly throughputFactor: number;
  readonly idleLossPerTick: number;
}

/**
 * 空間效率 × 時間規劃：距離增加週期、降低產出係數；物流效率縮短週期。
 */
export function computeProductionTiming(
  baseCycleTicks: number,
  travelTickPerDistance: number,
  parcel: Parcel,
  logisticsEfficiency: number,
): ProductionTimingView {
  const workerTravelTicks = manhattanToSupplyHub(parcel);
  const travelPenalty = workerTravelTicks * travelTickPerDistance;
  const rawCycle = baseCycleTicks + travelPenalty;
  const cycleTicks = Math.max(1, Math.ceil(rawCycle / Math.max(logisticsEfficiency, 0.5)));
  const throughputFactor = Math.max(0.35, 1 - workerTravelTicks * 0.045);
  const idleLossPerTick = Math.min(90, Math.round(workerTravelTicks * 6 + travelPenalty * 4));
  return {
    workerTravelTicks,
    cycleTicks,
    throughputFactor,
    idleLossPerTick,
  };
}
