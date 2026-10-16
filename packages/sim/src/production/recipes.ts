import type { ItemId } from './items.js';

export type RecipeId = 'make-basic-part' | 'make-alloy-plate';

export interface RecipeDef {
  readonly id: RecipeId;
  readonly nameZh: string;
  readonly inputs: readonly { readonly itemId: ItemId; readonly quantity: number }[];
  readonly outputItemId: ItemId;
  readonly outputQuantity: number;
  readonly baseCycleTicks: number;
  readonly travelTickPerDistance: number;
}

export const RECIPES: Record<RecipeId, RecipeDef> = {
  'make-basic-part': {
    id: 'make-basic-part',
    nameZh: '壓製基礎零件',
    inputs: [
      { itemId: 'raw-ore', quantity: 2 },
      { itemId: 'resin', quantity: 1 },
    ],
    outputItemId: 'basic-part',
    outputQuantity: 1,
    baseCycleTicks: 3,
    travelTickPerDistance: 1,
  },
  'make-alloy-plate': {
    id: 'make-alloy-plate',
    nameZh: '熔鑄合金板',
    inputs: [
      { itemId: 'raw-ore', quantity: 3 },
      { itemId: 'basic-part', quantity: 1 },
    ],
    outputItemId: 'alloy-plate',
    outputQuantity: 1,
    baseCycleTicks: 5,
    travelTickPerDistance: 1,
  },
};

export const RECIPE_LIST: readonly RecipeDef[] = Object.values(RECIPES);
