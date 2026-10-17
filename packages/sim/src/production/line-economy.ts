import type { Parcel } from '../types/map.js';
import { ITEMS } from './items.js';
import { computeProductionTiming } from './logistics.js';
import { MACHINE_GRADES, resolveMachineTuning, type MachineGradeId } from './machines.js';
import type { RecipeDef, RecipeStage } from './recipes.js';

/**
 * 距離指數。1 的產出係數不受指數影響；低於 1 時，指數愈大掉得愈快。
 *
 * 開採較平，所以遠礦仍有量。加工與成品的名目單價較高，
 * 但指數把溢價收在靠近供應樞紐的地塊上——拉長路程後賣礦會反超。
 */
export const STAGE_DEPTH_DRAG: Record<RecipeStage, number> = {
  extract: 0.75,
  process: 2.4,
  finish: 2.6,
};

const STAGE_IDLE_WEIGHT: Record<RecipeStage, number> = {
  extract: 0.75,
  process: 1,
  finish: 1.35,
};

/** 機械與富礦加成疊加前的上限，避免指數把係數放大到失真。 */
const BOOST_CAP = 1.35;
const EFFECTIVE_CAP = 2.4;

export interface LineProjection {
  readonly cycleTicks: number;
  readonly workerTravelTicks: number;
  readonly travelTicks: number;
  readonly throughputFactor: number;
  readonly idleLossPerTick: number;
  readonly pathGated: boolean;
  readonly machineGradeId: MachineGradeId | null;
  readonly profitPerTick: number;
}

export function recipeLedger(recipe: RecipeDef): { output: number; input: number; margin: number } {
  const output =
    ITEMS[recipe.outputItemId].unitValue * recipe.outputQuantity * recipe.outputMultiplier;
  const input = recipe.inputs.reduce(
    (sum, item) => sum + ITEMS[item.itemId].unitValue * item.quantity,
    0,
  );
  return { output, input, margin: output - input };
}

/** 把距離係數收成有效產量。base 為 1 時結果是 1，與指數無關。 */
export function applyDepthDrag(
  stage: RecipeStage,
  baseThroughput: number,
  dragScale: number,
): number {
  const base = Math.min(BOOST_CAP, Math.max(0.05, baseThroughput));
  const exponent = STAGE_DEPTH_DRAG[stage] * Math.max(0.05, dragScale);
  return Math.min(EFFECTIVE_CAP, Math.pow(base, exponent));
}

export function profitPerTick(
  recipe: RecipeDef,
  cycleTicks: number,
  effectiveThroughput: number,
): number {
  const { output, input } = recipeLedger(recipe);
  return (output * effectiveThroughput - input) / Math.max(1, cycleTicks);
}

/** 短路程、未裝機、係數 1 的名目每刻毛利。 */
export function nominalProfitPerTick(recipe: RecipeDef): number {
  return recipeLedger(recipe).margin / Math.max(1, recipe.baseCycleTicks);
}

export function projectLine(
  recipe: RecipeDef,
  parcel: Parcel,
  logisticsEfficiency: number,
  machineGradeId: MachineGradeId | null,
  localBonus = 1,
): LineProjection {
  const timing = computeProductionTiming(
    recipe.baseCycleTicks,
    recipe.travelTickPerDistance,
    parcel,
    logisticsEfficiency,
  );
  const grade = machineGradeId ? MACHINE_GRADES[machineGradeId] : null;
  const tuning = resolveMachineTuning(grade, recipe.stage, timing.workerTravelTicks);
  const cycleTicks = Math.max(
    1,
    Math.ceil(
      (recipe.baseCycleTicks / Math.max(logisticsEfficiency, 0.5)) * tuning.cycleMultiplier,
    ),
  );
  const boosted = timing.throughputFactor * Math.max(0, localBonus) * tuning.throughputMultiplier;
  const throughputFactor = applyDepthDrag(recipe.stage, boosted, tuning.depthDragScale);
  const idleLossPerTick = Math.round(
    timing.idleLossPerTick * tuning.idleSensitivity * STAGE_IDLE_WEIGHT[recipe.stage],
  );
  const travelTicks = Math.min(timing.workerTravelTicks, Math.max(0, cycleTicks - 1));
  return {
    cycleTicks,
    workerTravelTicks: timing.workerTravelTicks,
    travelTicks,
    throughputFactor,
    idleLossPerTick,
    pathGated: tuning.pathGated,
    machineGradeId,
    profitPerTick: profitPerTick(recipe, cycleTicks, throughputFactor),
  };
}

export function chainMarginCue(
  recipe: RecipeDef,
  herePerTick: number,
  extractPerTick: number,
): string {
  const here = Math.round(herePerTick).toLocaleString('zh-Hant');
  const ore = Math.round(extractPerTick).toLocaleString('zh-Hant');
  if (recipe.stage === 'extract') {
    return `賣礦每刻約 ${here}。短路程的加工與成品更高；路程拉長後溢價會消失。`;
  }
  const vs = herePerTick > extractPerTick ? '高於' : '低於';
  const stage = recipe.stage === 'process' ? '加工' : '成品';
  return `${stage}每刻約 ${here}，${vs}賣原礦 ${ore}。產品不變；路程一長，深加工會掉到賣礦下面。`;
}
