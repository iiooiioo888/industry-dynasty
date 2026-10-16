import type { Parcel } from '../types/map.js';
import {
  recipeUsesLinkedResource,
  resourceThroughputBonus,
} from '../world/parcel-resources.js';
import { ITEMS } from './items.js';
import { addItem, getItemQty, removeItem, type PlayerStock } from './items.js';
import { computeProductionTiming } from './logistics.js';
import type { RecipeDef } from './recipes.js';

export type ProductionStatus = 'stopped' | 'running' | 'waiting_inputs';

export interface ProductionLine {
  readonly recipeId: RecipeDef['id'];
  readonly status: ProductionStatus;
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
}

export function createProductionLine(
  recipe: RecipeDef,
  parcel: Parcel,
  logisticsEfficiency: number,
): ProductionLine {
  const timing = computeProductionTiming(
    recipe.baseCycleTicks,
    recipe.travelTickPerDistance,
    parcel,
    logisticsEfficiency,
  );
  const usesLocal = recipeUsesLinkedResource(
    parcel.resource,
    recipe.inputs.map((i) => i.itemId),
  );
  const localBonus = resourceThroughputBonus(parcel.resource, usesLocal);
  const throughputFactor = Math.min(1.5, timing.throughputFactor * localBonus);

  return {
    recipeId: recipe.id,
    status: 'running',
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
  };
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
  const linked = parcel.resource.linkedItemId;

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
    return { line, stock, parcel };
  }

  if (!inputsAffordable(parcel, recipe, stock)) {
    const idleCost = line.idleLossPerTick;
    return {
      line: {
        ...line,
        status: 'waiting_inputs',
        idleTicksAccumulated: line.idleTicksAccumulated + 1,
        totalIdleLossValue: line.totalIdleLossValue + idleCost,
      },
      stock,
      parcel,
    };
  }

  let working: ProductionLine = {
    ...line,
    status: 'running',
    progressTicks: line.progressTicks + 1,
  };

  if (working.progressTicks < working.cycleTicks) {
    return { line: working, stock, parcel };
  }

  const consumed = consumeRecipeInputs(parcel, recipe, stock);
  if (!consumed.ok) {
    const idleCost = line.idleLossPerTick;
    return {
      line: {
        ...line,
        status: 'waiting_inputs',
        idleTicksAccumulated: line.idleTicksAccumulated + 1,
        totalIdleLossValue: line.totalIdleLossValue + idleCost,
        progressTicks: 0,
      },
      stock,
      parcel,
    };
  }

  const theoretical = recipe.outputQuantity;
  const actual = Math.max(0, Math.round(theoretical * working.throughputFactor));
  const lostUnits = Math.max(0, theoretical - actual);
  const unitVal = outputUnitValue(recipe);

  let nextStock = consumed.stock;
  if (actual > 0) {
    nextStock = addItem(nextStock, recipe.outputItemId, actual);
  }

  working = {
    ...working,
    progressTicks: 0,
    completedRuns: working.completedRuns + 1,
    totalOutputValue: working.totalOutputValue + actual * unitVal,
    totalDistanceLossValue: working.totalDistanceLossValue + lostUnits * unitVal,
  };

  return { line: working, stock: nextStock, parcel: consumed.parcel };
}

export function stopProductionLine(line: ProductionLine): ProductionLine {
  return { ...line, status: 'stopped', progressTicks: 0 };
}
