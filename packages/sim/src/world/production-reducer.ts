import { getSiteLogisticsView } from '../buildings/adjacency.js';
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
  const line = createProductionLine(recipe, parcel, logistics.factor);

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
    const stock = inventories[ownerId] ?? {};
    const beforeQty = getItemQty(stock, recipe.outputItemId);
    const result = tickProductionLine(line, recipe, stock, parcel);
    const granted = getItemQty(result.stock, recipe.outputItemId) - beforeQty;
    inventories = { ...inventories, [ownerId]: result.stock };
    if (granted > 0) {
      craftedTotals = {
        ...craftedTotals,
        [ownerId]: addItem(craftedTotals[ownerId] ?? {}, recipe.outputItemId, granted),
      };
    }
    productionLines[key] = result.line;
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
