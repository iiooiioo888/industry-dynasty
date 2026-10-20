import { FACTORY_TYPES, type FactoryTypeId } from '../buildings/catalog.js';
import { PARCEL_RESOURCE_DEFS, type ParcelResourceKind } from '../world/parcel-resources.js';
import { getItemQty, ITEMS, type ItemTier, type PlayerStock } from './items.js';
import { TECH_GATES, type RecipeDef } from './recipes.js';

export function craftedByTier(crafted: PlayerStock | undefined, tier: ItemTier): number {
  let sum = 0;
  for (const item of Object.values(ITEMS)) {
    if (item.tier === tier) {
      sum += getItemQty(crafted ?? {}, item.id);
    }
  }
  return sum;
}

/** 入庫累計。起始庫存不算，所以買地建廠不會被技術擋住。 */
export function techStage(crafted: PlayerStock | undefined): 0 | 1 | 2 {
  if (craftedByTier(crafted, 'intermediate') >= TECH_GATES.finishCraftedIntermediate) {
    return 2;
  }
  if (craftedByTier(crafted, 'raw') >= TECH_GATES.processCraftedRaw) {
    return 1;
  }
  return 0;
}

export function unitsUntilNextStage(crafted: PlayerStock | undefined): string {
  const stage = techStage(crafted);
  if (stage >= 2) {
    return '階段已全開';
  }
  if (stage === 0) {
    const left = Math.max(0, TECH_GATES.processCraftedRaw - craftedByTier(crafted, 'raw'));
    return `原料再 ${left} 開冶煉`;
  }
  const left = Math.max(
    0,
    TECH_GATES.finishCraftedIntermediate - craftedByTier(crafted, 'intermediate'),
  );
  return `中間件再 ${left} 開合金板`;
}

export function recipeBlockReason(args: {
  recipe: RecipeDef;
  resourceKind: ParcelResourceKind;
  factoryTypeId: FactoryTypeId;
  crafted: PlayerStock | undefined;
  unlockedResearch?: readonly string[];
}): string | null {
  const { recipe, resourceKind, factoryTypeId, crafted } = args;
  if (!(recipe.buildings as readonly string[]).includes(factoryTypeId)) {
    const names = recipe.buildings.map((id) => FACTORY_TYPES[id].nameZh).join('或');
    return `需使用${names}`;
  }
  if (recipe.sourceKind && recipe.sourceKind !== resourceKind) {
    return `需建在${PARCEL_RESOURCE_DEFS[recipe.sourceKind].nameZh}`;
  }
  if (recipe.researchId && !(args.unlockedResearch ?? []).includes(recipe.researchId)) {
    return '需先在研發室解鎖此產品';
  }
  if (techStage(crafted) < recipe.minTechStage) {
    return unitsUntilNextStage(crafted);
  }
  return null;
}

/** 規劃利潤／週期。距離拉長週期、壓低產出係數；開採不計原料帳面成本。 */
export function planProfitPerTick(
  recipe: RecipeDef,
  cycleTicks: number,
  throughputFactor: number,
): number {
  const inputValue = recipe.inputs.reduce(
    (sum, input) => sum + ITEMS[input.itemId].unitValue * input.quantity,
    0,
  );
  const outputValue =
    ITEMS[recipe.outputItemId].unitValue *
    recipe.outputQuantity *
    (recipe.outputMultiplier ?? 1) *
    throughputFactor;
  return (outputValue - inputValue) / Math.max(cycleTicks, 1);
}

export function recipeSourceLabel(recipe: RecipeDef): string {
  if (recipe.sourceKind) {
    return PARCEL_RESOURCE_DEFS[recipe.sourceKind].nameZh;
  }
  return recipe.inputs
    .map((input) => `${ITEMS[input.itemId].nameZh}×${input.quantity}`)
    .join(' + ');
}

export function recipeOutputLabel(recipe: RecipeDef): string {
  return `${ITEMS[recipe.outputItemId].nameZh}×${recipe.outputQuantity}`;
}
