import type { ParcelId } from './map.js';

export type BuildingKind = 'factory' | 'warehouse' | 'office';

export interface Building {
  readonly id: string;
  readonly kind: BuildingKind;
  readonly parcelId: ParcelId;
  readonly level: number;
}
