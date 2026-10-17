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
 * 空間效率 × 時間規劃。
 *
 * **距離只影響產出係數，不拉長週期。**
 * 原本 `cycleTicks = (base + 距離) / 效率`，距離 8 的地塊每週期要 10 刻，
 * 25 天只能跑 2.5 個週期，工廠幾乎沒有產出 —— 於是「每多蓋一座工廠就多虧一座」，
 * 數量槓桿完全失效。改成距離只壓低「每次產出多少」之後：
 *
 * - 近址：週期短、產出滿載 → 坪效高
 * - 遠址：週期一樣短，但每次產出打折 → 坪效低
 *
 * 兩者的每日產出仍然隨距離單調遞減（見 `distance-cost.test.ts`），
 * 但不會出現「遠到幾乎不生產」的懸崖。
 *
 * `logisticsEfficiency`（道路、城市、相鄰工廠）仍會縮短週期，保留區位加成。
 * 工人去程被收進週期前段（最多 `cycleTicks - 1` 刻），不再把週期拉成路程長度。
 * 港區出貨不走這條捷徑：貨要按路徑長度走完模擬時間才入帳。
 */
export function computeProductionTiming(
  baseCycleTicks: number,
  _travelTickPerDistance: number,
  parcel: Parcel,
  logisticsEfficiency: number,
  config: DistanceCostConfig = DEFAULT_DISTANCE_COST,
): ProductionTimingView {
  const workerTravelTicks = manhattanToSupplyHub(parcel);
  const travelPenalty = workerTravelTicks * _travelTickPerDistance;
  const cycleTicks = Math.max(1, Math.ceil(baseCycleTicks / Math.max(logisticsEfficiency, 0.5)));
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
