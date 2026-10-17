import { getSiteLogisticsView } from '../buildings/adjacency.js';
import { SIM_MS_PER_TICK } from './clock.js';
import type { CompleteSite } from '../buildings/site.js';
import { getSiteForParcel } from '../buildings/build-logic.js';
import { recipeBlockReason } from '../production/chain.js';
import {
  addItem,
  createProductionLine,
  getItemQty,
  RECIPES,
  stopProductionLine,
  tickProductionLine,
  type RecipeId,
} from '../production/index.js';
import type { ParcelId } from '../types/map.js';
import { findParcel, type WorldState } from './state.js';

export function getProductionLine(state: WorldState, parcelId: ParcelId) {
  return state.productionLines[parcelId.value];
}

export function applyStartProduction(
  state: WorldState,
  parcelId: ParcelId,
  recipeId: RecipeId,
): WorldState {
  const parcel = findParcel(state, parcelId);
  const player = state.players[state.localPlayerId];
  const site = getSiteForParcel(state.sites, parcelId);
  if (!parcel || !player || !site || site.phase !== 'complete' || site.ownerId !== player.id) {
    return state;
  }
  if (parcel.state !== 'building-ready') {
    return state;
  }

  const recipe = RECIPES[recipeId];
  if (!recipe) {
    return state;
  }
  if (
    recipeBlockReason({
      recipe,
      resourceKind: parcel.resource.kind,
      factoryTypeId: site.factoryTypeId,
      crafted: state.craftedTotals[player.id],
    })
  ) {
    return state;
  }

  const logistics = getSiteLogisticsView(state.map, parcel, site as CompleteSite, state.sites);
  const line = createProductionLine(recipe, parcel, logistics.factor, state.clock.simMs);

  return {
    ...state,
    productionLines: { ...state.productionLines, [parcelId.value]: line },
  };
}

export function applyStopProduction(state: WorldState, parcelId: ParcelId): WorldState {
  const line = state.productionLines[parcelId.value];
  if (!line) {
    return state;
  }
  return {
    ...state,
    productionLines: {
      ...state.productionLines,
      [parcelId.value]: stopProductionLine(line),
    },
  };
}

export function applyProductionTick(state: WorldState): WorldState {
  let inventories = { ...state.inventories };
  let craftedTotals = { ...state.craftedTotals };
  const productionLines = { ...state.productionLines };
  let map = state.map;

  for (const [key, line] of Object.entries(productionLines)) {
    if (line.status === 'stopped') {
      continue;
    }
    const parcel = map.parcels.find((p) => p.id.value === key);
    const site = state.sites[key];
    if (!parcel || !site || site.phase !== 'complete') {
      continue;
    }

    const ownerId = site.ownerId;
    const recipe = RECIPES[line.recipeId];
    // 逐條線依序讀寫 inventories：每條線都看到前一條線寫回後的最新庫存，
    // 因此多座工廠共用同一份玩家庫存時，消耗與產出都會累加。
    // （`inventories` 在迴圈內被重新賦值，這裡讀到的一定是累積結果。）
    const stock = inventories[ownerId] ?? {};
    const beforeQty = getItemQty(stock, recipe.outputItemId);
    const result = tickProductionLine(line, recipe, stock, parcel);
    const stalled = result.line.status === 'waiting_inputs';
    const stallTicks = stalled
      ? line.status === 'waiting_inputs'
        ? line.stallTicks
        : Math.min(1, Math.max(0, (state.clock.simMs - line.progressAnchorMs) / SIM_MS_PER_TICK))
      : 0;
    const progressAnchorMs =
      !stalled && line.stallTicks > 0
        ? state.clock.simMs - line.stallTicks * SIM_MS_PER_TICK
        : state.clock.simMs;
    const granted = getItemQty(result.stock, recipe.outputItemId) - beforeQty;
    inventories = { ...inventories, [ownerId]: result.stock };
    if (granted > 0) {
      craftedTotals = {
        ...craftedTotals,
        [ownerId]: addItem(craftedTotals[ownerId] ?? {}, recipe.outputItemId, granted),
      };
    }
    productionLines[key] = { ...result.line, progressAnchorMs, stallTicks };
    map = {
      ...map,
      parcels: map.parcels.map((p) => (p.id.value === key ? result.parcel : p)),
    };
  }

  return {
    ...state,
    map,
    inventories,
    craftedTotals,
    productionLines,
    productionTick: state.productionTick + 1,
  };
}

export function clearProductionAtParcel(
  productionLines: WorldState['productionLines'],
  parcelKey: string,
): WorldState['productionLines'] {
  if (!productionLines[parcelKey]) {
    return productionLines;
  }
  const next = { ...productionLines };
  delete next[parcelKey];
  return next;
}
