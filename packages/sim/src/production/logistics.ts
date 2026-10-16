import type { Parcel } from '../types/map.js';
import {
  DEFAULT_DISTANCE_COST,
  idleLossCurve,
  manhattanToSupplyHub,
  throughputCurve,
  type DistanceCostConfig,
} from './distance-cost.js';

export { manhattanToSupplyHub, SUPPLY_HUB } from './distance-cost.js';

export interface ProductionTimingView {
  readonly workerTravelTicks: number;
  readonly cycleTicks: number;
  readonly throughputFactor: number;
  readonly idleLossPerTick: number;
  /** 產出係數是否已落在曲線下界（true 代表此地塊與更遠處成本相同）。 */
  readonly throughputAtFloor: boolean;
}

/**
 * 空間效率 × 時間規劃：距離增加週期、降低產出係數；物流效率縮短週期。
 *
 * 曲線形狀與係數集中在 `distance-cost.ts`；本函式只負責接到週期與產出係數。
 * 預設曲線（soft-exponential）在整張地圖上都不提前飽和，因此
 * 「空間效率」在每一格都仍然是有效決策。
 */
export function computeProductionTiming(
  baseCycleTicks: number,
  travelTickPerDistance: number,
  parcel: Parcel,
  logisticsEfficiency: number,
  config: DistanceCostConfig = DEFAULT_DISTANCE_COST,
): ProductionTimingView {
  const workerTravelTicks = manhattanToSupplyHub(parcel);
  const travelPenalty = workerTravelTicks * travelTickPerDistance;
  const rawCycle = baseCycleTicks + travelPenalty;
  const cycleTicks = Math.max(1, Math.ceil(rawCycle / Math.max(logisticsEfficiency, 0.5)));
  const throughputFactor = throughputCurve(workerTravelTicks, config.throughput);
  const idleLossPerTick = idleLossCurve(workerTravelTicks, travelPenalty, config.idle);
  return {
    workerTravelTicks,
    cycleTicks,
    throughputFactor,
    idleLossPerTick,
    throughputAtFloor: throughputFactor <= config.throughput.floor + 1e-9,
  };
}
