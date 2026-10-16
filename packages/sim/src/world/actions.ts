import type { FactoryTypeId } from '../buildings/catalog.js';
import type { RecipeId } from '../production/recipes.js';
import type { ParcelId } from '../types/map.js';

export type WorldAction =
  | { type: 'BID'; parcelId: ParcelId; amount: number }
  | { type: 'SETTLE_AUCTION'; parcelId: ParcelId }
  | { type: 'ADVANCE_TAX_TICK' }
  | { type: 'START_BUILD'; parcelId: ParcelId; factoryTypeId: FactoryTypeId }
  | { type: 'ADVANCE_BUILD_TICK' }
  | { type: 'CANCEL_BUILD'; parcelId: ParcelId }
  | { type: 'DEMOLISH'; parcelId: ParcelId }
  | { type: 'START_PRODUCTION'; parcelId: ParcelId; recipeId: RecipeId }
  | { type: 'STOP_PRODUCTION'; parcelId: ParcelId }
  | { type: 'ADVANCE_PRODUCTION_TICK' };
