import type { Parcel } from '../types/map.js';
import type { WorldConfig } from './config.js';

/**
 * 在地需求。
 * 人口是主因：密度上升時，收購量與單價一起上升。
 * 城市臨近度加價、加量；道路決定這些需求有多少運得出去。
 * 地理欄位在開局寫入土地，報價只讀土地本身，銷售流程可直接呼叫。
 */
export const DEMAND_BASE_UNIT_PRICE = 100;
export const DEMAND_BASE_WEEKLY_VOLUME = 10;

export interface LocalDemandQuote {
  /** 0–1，人口權重最高。 */
  readonly demandIndex: number;
  readonly populationDensity: number;
  readonly unitPrice: number;
  readonly weeklyVolume: number;
  readonly priceMultiplier: number;
  readonly volumeMultiplier: number;
  readonly roadAccess: number;
  readonly cityProximity: number;
}

export function quoteLocalDemand(parcel: Parcel): LocalDemandQuote {
  const population = clamp01(parcel.populationDensity / 100);
  const road = clamp01(parcel.roadAccess);
  const city = clamp01(parcel.cityProximity);

  const demandIndex = clamp01(0.62 * population + 0.24 * city + 0.14 * road);
  const priceMultiplier = 0.7 + 0.62 * population + 0.22 * city + 0.1 * road;
  const volumeMultiplier = (0.2 + 1.4 * population) * (0.5 + 0.5 * road) * (0.8 + 0.4 * city);

  return {
    demandIndex,
    populationDensity: parcel.populationDensity,
    unitPrice: Math.max(1, Math.round(DEMAND_BASE_UNIT_PRICE * priceMultiplier)),
    weeklyVolume: Math.max(1, Math.round(DEMAND_BASE_WEEKLY_VOLUME * volumeMultiplier)),
    priceMultiplier,
    volumeMultiplier,
    roadAccess: road,
    cityProximity: city,
  };
}

/**
 * 可購土地底價。格子本身的拍賣階梯仍在，另加人口、城市與道路的區位溢價。
 * 密集區更貴，偏遠地更便宜——利潤來自買對位置，而不是買最多地。
 */
export function quoteAuctionMinPrice(
  parcel: Parcel,
  config: Pick<WorldConfig, 'auctionMinPriceBase' | 'auctionMinPriceStep'>,
): number {
  const locationPremium = Math.round(
    parcel.populationDensity * 24 + parcel.cityProximity * 2_000 + parcel.roadAccess * 800,
  );
  return (
    config.auctionMinPriceBase +
    (parcel.x + parcel.y) * config.auctionMinPriceStep +
    locationPremium
  );
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
