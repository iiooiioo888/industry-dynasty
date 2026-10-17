import type { Parcel } from '../types/map.js';
import { recipeUsesLinkedResource, resourceThroughputBonus } from '../world/parcel-resources.js';
import { ITEMS } from './items.js';
import { addItem, getItemQty, removeItem, type PlayerStock } from './items.js';
import { computeProductionTiming } from './logistics.js';
import type { RecipeDef } from './recipes.js';

export type ProductionStatus = 'stopped' | 'running' | 'waiting_inputs';

/** 趕路結束前不會進入作業。路程刻數含在既有週期內，不額外加長產出。 */
export type ProductionMotion = 'traveling' | 'working';

export interface ProductionLine {
  readonly recipeId: RecipeDef['id'];
  readonly status: ProductionStatus;
  readonly phase: ProductionMotion;
  /** 本週期用於往返供應樞紐的刻數。0 表示人已在樞紐，直接作業。 */
  readonly travelTicks: number;
  /** 最近一次提交 progressTicks 時的模擬毫秒，用來在刻與刻之間插值。 */
  readonly progressAnchorMs: number;
  /**
   * 待料時凍結的不足一格路程（0–1）。
   * 保留進入閒置前已經走出的那一段，避免被拉回上一格。
   */
  readonly stallTicks: number;
  readonly progressTicks: number;
  readonly cycleTicks: number;
  readonly throughputFactor: number;
  readonly workerTravelTicks: number;
  readonly idleLossPerTick: number;
  readonly idleTicksAccumulated: number;
  readonly completedRuns: number;
  readonly totalOutputValue: number;
  readonly totalDistanceLossValue: number;
  readonly totalIdleLossValue: number;
  readonly localResourceBonus: number;
  readonly localResourceNameZh: string;
  /**
   * 產出係數造成的不足一單位餘額，累積到下一週期。
   *
   * 沒有這個欄位時，`round(outputQuantity × throughputFactor)` 會把損失**逐週期截斷**：
   * 產出 2 單位的配方只要係數低於 0.75 就只剩 1 單位，低於 0.25 更會歸零，
   * 於是距離會讓開採量直接砍半甚至完全停產。改成跨週期累積後，
   * 距離只影響**長期平均產出**，不會出現這種懸崖。
   */
  readonly fractionalOutput: number;
}

export function motionPhase(
  line: Pick<ProductionLine, 'status' | 'progressTicks' | 'travelTicks'>,
): ProductionMotion {
  if (line.status === 'stopped') {
    return 'working';
  }
  if (line.travelTicks > 0 && line.progressTicks < line.travelTicks) {
    return 'traveling';
  }
  return 'working';
}

function withMotion<T extends ProductionLine>(line: T): T {
  return { ...line, phase: motionPhase(line) };
}

export function createProductionLine(
  recipe: RecipeDef,
  parcel: Parcel,
  logisticsEfficiency: number,
  anchorMs = 0,
): ProductionLine {
  const timing = computeProductionTiming(
    recipe.baseCycleTicks,
    recipe.travelTickPerDistance,
    parcel,
    logisticsEfficiency,
  );
  const usesLocal = recipe.sourceKind
    ? parcel.resource.kind === recipe.sourceKind
    : recipeUsesLinkedResource(
        parcel.resource,
        recipe.inputs.map((i) => i.itemId),
      );
  const localBonus = resourceThroughputBonus(parcel.resource, usesLocal);
  const throughputFactor = Math.min(1.5, timing.throughputFactor * localBonus);
  // 去程畫在週期前段。workerTravelTicks 仍是到樞紐的真實步數，供距離懲罰使用。
  const travelTicks = Math.min(timing.workerTravelTicks, Math.max(0, timing.cycleTicks - 1));

  return withMotion({
    recipeId: recipe.id,
    status: 'running',
    phase: 'working',
    travelTicks,
    progressAnchorMs: anchorMs,
    stallTicks: 0,
    progressTicks: 0,
    cycleTicks: timing.cycleTicks,
    throughputFactor,
    workerTravelTicks: timing.workerTravelTicks,
    idleLossPerTick: timing.idleLossPerTick,
    idleTicksAccumulated: 0,
    completedRuns: 0,
    totalOutputValue: 0,
    totalDistanceLossValue: 0,
    totalIdleLossValue: 0,
    localResourceBonus: localBonus,
    localResourceNameZh: parcel.resource.nameZh,
    fractionalOutput: 0,
  });
}

export interface ProductionTickResult {
  readonly line: ProductionLine;
  readonly stock: PlayerStock;
  readonly parcel: Parcel;
}

function outputUnitValue(recipe: RecipeDef): number {
  return ITEMS[recipe.outputItemId].unitValue;
}

function consumeRecipeInputs(
  parcel: Parcel,
  recipe: RecipeDef,
  stock: PlayerStock,
): { ok: boolean; stock: PlayerStock; parcel: Parcel } {
  let nextParcel = parcel;
  let nextStock = stock;
  if (recipe.reserveCost > 0) {
    if (
      nextParcel.resource.kind !== recipe.sourceKind ||
      nextParcel.resource.reserves < recipe.reserveCost
    ) {
      return { ok: false, stock, parcel };
    }
    nextParcel = {
      ...nextParcel,
      resource: {
        ...nextParcel.resource,
        reserves: nextParcel.resource.reserves - recipe.reserveCost,
      },
    };
  }
  const linked = nextParcel.resource.linkedItemId;

  for (const input of recipe.inputs) {
    let need = input.quantity;
    if (input.itemId === linked && nextParcel.resource.reserves > 0) {
      const fromGround = Math.min(need, 1, nextParcel.resource.reserves);
      need -= fromGround;
      nextParcel = {
        ...nextParcel,
        resource: {
          ...nextParcel.resource,
          reserves: nextParcel.resource.reserves - fromGround,
        },
      };
    }
    if (need <= 0) {
      continue;
    }
    const removed = removeItem(nextStock, input.itemId, need);
    if (!removed) {
      return { ok: false, stock, parcel };
    }
    nextStock = removed;
  }

  return { ok: true, stock: nextStock, parcel: nextParcel };
}

function inputsAffordable(parcel: Parcel, recipe: RecipeDef, stock: PlayerStock): boolean {
  if (recipe.reserveCost > 0) {
    if (
      parcel.resource.kind !== recipe.sourceKind ||
      parcel.resource.reserves < recipe.reserveCost
    ) {
      return false;
    }
  }
  for (const input of recipe.inputs) {
    let need = input.quantity;
    if (input.itemId === parcel.resource.linkedItemId && parcel.resource.reserves > 0) {
      need -= Math.min(need, 1, parcel.resource.reserves);
    }
    if (need > 0 && getItemQty(stock, input.itemId) < need) {
      return false;
    }
  }
  return true;
}

export function tickProductionLine(
  line: ProductionLine,
  recipe: RecipeDef,
  stock: PlayerStock,
  parcel: Parcel,
): ProductionTickResult {
  if (line.status === 'stopped') {
    return { line: withMotion(line), stock, parcel };
  }

  if (!inputsAffordable(parcel, recipe, stock)) {
    const idleCost = line.idleLossPerTick;
    return {
      line: withMotion({
        ...line,
        status: 'waiting_inputs',
        idleTicksAccumulated: line.idleTicksAccumulated + 1,
        totalIdleLossValue: line.totalIdleLossValue + idleCost,
      }),
      stock,
      parcel,
    };
  }

  let working: ProductionLine = withMotion({
    ...line,
    status: 'running',
    progressTicks: line.progressTicks + 1,
  });

  if (working.progressTicks < working.cycleTicks) {
    return { line: working, stock, parcel };
  }

  const consumed = consumeRecipeInputs(parcel, recipe, stock);
  if (!consumed.ok) {
    const idleCost = line.idleLossPerTick;
    return {
      line: withMotion({
        ...line,
        status: 'waiting_inputs',
        idleTicksAccumulated: line.idleTicksAccumulated + 1,
        totalIdleLossValue: line.totalIdleLossValue + idleCost,
        progressTicks: 0,
      }),
      stock,
      parcel,
    };
  }

  // 開採類每週期產出多單位（見 EXTRACT_OUTPUT_MULTIPLIER），加工類維持 v1。
  const theoretical = recipe.outputQuantity * (recipe.outputMultiplier ?? 1);
  // 與上一週期的餘額合併後才取整，讓距離造成的損失平均分攤而不是逐週期截斷。
  const rawOutput = theoretical * working.throughputFactor + (working.fractionalOutput ?? 0);
  const actual = Math.max(0, Math.floor(rawOutput));
  const fractionalOutput = rawOutput - actual;
  const unitVal = outputUnitValue(recipe);
  // 距離損失按係數缺口計，餘額留在 fractionalOutput，不會被當成整單位損失。
  const distanceGap = Math.max(0, 1 - working.throughputFactor);
  const lostValue = Math.round(Math.max(0, theoretical * distanceGap * unitVal));

  let nextStock = consumed.stock;
  if (actual > 0) {
    nextStock = addItem(nextStock, recipe.outputItemId, actual);
  }

  working = withMotion({
    ...working,
    progressTicks: 0,
    completedRuns: working.completedRuns + 1,
    totalOutputValue: working.totalOutputValue + actual * unitVal,
    totalDistanceLossValue: working.totalDistanceLossValue + lostValue,
    fractionalOutput,
  });

  return { line: working, stock: nextStock, parcel: consumed.parcel };
}

export function stopProductionLine(line: ProductionLine): ProductionLine {
  return withMotion({ ...line, status: 'stopped', progressTicks: 0, stallTicks: 0 });
}
