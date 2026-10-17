import type { FactoryTypeId } from './catalog.js';

export type SitePhase = 'constructing' | 'complete';

export interface ConstructingSite {
  readonly phase: 'constructing';
  readonly factoryTypeId: FactoryTypeId;
  readonly ownerId: string;
  readonly progressTicks: number;
  readonly totalTicks: number;
  /** 最近一次建設刻對齊的模擬毫秒。缺省時不插值，避免舊狀態被快轉。 */
  readonly progressAnchorMs?: number;
}

export interface CompleteSite {
  readonly phase: 'complete';
  readonly factoryTypeId: FactoryTypeId;
  readonly ownerId: string;
  readonly buildingId: string;
}

export type ParcelSite = ConstructingSite | CompleteSite;

export function parcelSiteKey(parcelIdValue: string): string {
  return parcelIdValue;
}
