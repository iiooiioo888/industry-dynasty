import type { FactoryTypeId } from './catalog.js';

export type SitePhase = 'constructing' | 'complete';

export interface ConstructingSite {
  readonly phase: 'constructing';
  readonly factoryTypeId: FactoryTypeId;
  readonly ownerId: string;
  readonly progressTicks: number;
  readonly totalTicks: number;
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
