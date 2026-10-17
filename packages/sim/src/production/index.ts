export {
  addItem,
  DEFAULT_STARTING_STOCK,
  getItemQty,
  hasRecipeInputs,
  ITEMS,
  type ItemDef,
  type ItemId,
  type PlayerStock,
} from './items.js';
export {
  computeProductionTiming,
  manhattanToSupplyHub,
  SUPPLY_HUB,
  type ProductionTimingView,
} from './logistics.js';
export {
  DEFAULT_DISTANCE_COST,
  LEGACY_DISTANCE_COST,
  idleLossCurve,
  idleSaturationDistance,
  saturationDistance,
  shareOfMapBeyond,
  throughputCurve,
  type DistanceCostConfig,
  type DistanceCurveShape,
  type IdleLossCurveConfig,
  type ThroughputCurveConfig,
} from './distance-cost.js';
export {
  createProductionLine,
  retuneProductionLine,
  stopProductionLine,
  tickProductionLine,
  motionPhase,
  type ProductionLine,
  type ProductionMotion,
  type ProductionStatus,
} from './production-line.js';
export {
  MACHINE_GRADE_LIST,
  MACHINE_GRADES,
  MACHINE_PRODUCT_NOTE,
  machineCreditAfter,
  machineUpgradeDue,
  resolveMachineTuning,
  stageMachineLeverage,
  type MachineGradeDef,
  type MachineGradeId,
  type MachineTuning,
} from './machines.js';
export {
  STAGE_DEPTH_DRAG,
  applyDepthDrag,
  chainMarginCue,
  nominalProfitPerTick,
  profitPerTick,
  projectLine,
  recipeLedger,
  type LineProjection,
} from './line-economy.js';
export {
  craftedByTier,
  planProfitPerTick,
  recipeBlockReason,
  recipeOutputLabel,
  recipeSourceLabel,
  techStage,
  unitsUntilNextStage,
} from './chain.js';
export {
  CHAIN_STAGES,
  RECIPE_LIST,
  RECIPES,
  TECH_GATES,
  type RecipeDef,
  type RecipeId,
  type RecipeStage,
} from './recipes.js';
export { ITEM_LIST, type ItemTier } from './items.js';
