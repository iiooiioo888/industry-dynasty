import { FACTORY_TYPES } from '../buildings/catalog.js';
import { addItem, getItemQty, ITEMS, removeItem, type ItemId, type PlayerStock } from '../production/items.js';
import { RECIPES, type RecipeId } from '../production/recipes.js';
import { SUPPLY_HUB } from '../production/logistics.js';
import { addPnL, emptyPnL } from '../sales/pnl.js';
import { TRANSPORT_RATE_PER_TILE } from '../sales/ship-route.js';
import type { ParcelId } from '../types/map.js';
import { SIM_MS_PER_TICK } from '../world/clock.js';
import { findPath, pointAlongPath, type TilePoint } from '../world/pathfinding.js';
import { findParcel, getPlayerInventory, getProductionLine, type WorldState } from '../world/state.js';

export interface SupplyHaul {
  readonly id: string;
  readonly ownerId: string;
  readonly itemId: ItemId;
  readonly quantity: number;
  readonly fromX: number;
  readonly fromY: number;
  readonly toX: number;
  readonly toY: number;
  readonly toParcelId: string;
  readonly departSimMs: number;
  readonly arriveSimMs: number;
  readonly travelTicks: number;
  readonly freight: number;
}

export interface SupplyHaulView {
  readonly id: string;
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly points: readonly TilePoint[];
}

export interface ChainNeighbor {
  readonly recipeId: RecipeId;
  readonly nameZh: string;
  readonly itemNameZh: string;
}

const EMPTY_BIN: PlayerStock = {};

export function listSupplyHauls(state: WorldState): readonly SupplyHaul[] {
  return state.supplyHauls ?? [];
}

export function siteBin(state: WorldState, parcelKey: string): PlayerStock {
  return state.siteBins?.[parcelKey] ?? EMPTY_BIN;
}

export function upstreamOf(recipeId: RecipeId): readonly ChainNeighbor[] {
  const wanted = new Set<string>(RECIPES[recipeId].inputs.map((input) => input.itemId));
  return Object.values(RECIPES)
    .filter((recipe) => wanted.has(recipe.outputItemId))
    .map(toNeighbor);
}

export function downstreamOf(recipeId: RecipeId): readonly ChainNeighbor[] {
  const output = RECIPES[recipeId].outputItemId;
  return Object.values(RECIPES)
    .filter(
      (recipe) => recipe.id !== recipeId && recipe.inputs.some((input) => input.itemId === output),
    )
    .map(toNeighbor);
}

function toNeighbor(recipe: (typeof RECIPES)[RecipeId]): ChainNeighbor {
  return {
    recipeId: recipe.id,
    nameZh: recipe.nameZh,
    itemNameZh: ITEMS[recipe.outputItemId].nameZh,
  };
}

export function quoteSupplyDispatch(
  state: WorldState,
  args: { toParcelId: ParcelId; itemId: string; quantity: number; fromParcelId?: ParcelId | null },
): { ok: true; freight: number; travelTicks: number } | { ok: false; reason: string } {
  if (!Number.isInteger(args.quantity) || args.quantity <= 0) {
    return { ok: false, reason: '數量要是正整數' };
  }
  if (!(args.itemId in ITEMS)) {
    return { ok: false, reason: '沒有這個物料' };
  }
  const player = state.players[state.localPlayerId];
  const destination = findParcel(state, args.toParcelId);
  const site = state.sites[args.toParcelId.value];
  if (!player || !destination || destination.ownerId !== player.id || site?.phase !== 'complete') {
    return { ok: false, reason: '只能送進自己的完工建物' };
  }
  if (args.fromParcelId && args.fromParcelId.value === args.toParcelId.value) {
    return { ok: false, reason: '同一座廠不用送料' };
  }
  const available = args.fromParcelId
    ? getItemQty(siteBin(state, args.fromParcelId.value), args.itemId)
    : getItemQty(getPlayerInventory(state, player.id), args.itemId);
  if (available < args.quantity) {
    return { ok: false, reason: '來源庫存不足' };
  }
  if (args.fromParcelId) {
    const source = findParcel(state, args.fromParcelId);
    const sourceSite = state.sites[args.fromParcelId.value];
    if (!source || source.ownerId !== player.id || sourceSite?.phase !== 'complete') {
      return { ok: false, reason: '來源必須是自己的完工建物' };
    }
  }
  const origin = args.fromParcelId
    ? findParcel(state, args.fromParcelId)!
    : { x: SUPPLY_HUB.x, y: SUPPLY_HUB.y };
  const path = findPath(state.map, { x: origin.x, y: origin.y }, { x: destination.x, y: destination.y });
  const travelTicks = Math.max(1, path.length - 1);
  const freight = travelTicks * TRANSPORT_RATE_PER_TILE * args.quantity;
  if (player.cash < freight) {
    return { ok: false, reason: '運費不足' };
  }
  return { ok: true, freight, travelTicks };
}

export function dispatchSupply(
  state: WorldState,
  args: { toParcelId: ParcelId; itemId: string; quantity: number; fromParcelId?: ParcelId | null },
): WorldState {
  const quote = quoteSupplyDispatch(state, args);
  if (!quote.ok) {
    return state;
  }
  const player = state.players[state.localPlayerId]!;
  const destination = findParcel(state, args.toParcelId)!;
  const itemId = args.itemId as ItemId;
  const origin = args.fromParcelId ? findParcel(state, args.fromParcelId)! : SUPPLY_HUB;
  let inventories = state.inventories;
  let siteBins = state.siteBins;
  if (args.fromParcelId) {
    const key = args.fromParcelId.value;
    const nextBin = removeItem(siteBin(state, key), itemId, args.quantity);
    if (!nextBin) {
      return state;
    }
    siteBins = { ...(siteBins ?? {}), [key]: nextBin };
  } else {
    const nextStock = removeItem(getPlayerInventory(state, player.id), itemId, args.quantity);
    if (!nextStock) {
      return state;
    }
    inventories = { ...inventories, [player.id]: nextStock };
  }
  const haul: SupplyHaul = {
    id: `haul-${state.clock.simMs}-${destination.x}-${destination.y}-${itemId}-${args.quantity}-${listSupplyHauls(state).length}`,
    ownerId: player.id,
    itemId,
    quantity: args.quantity,
    fromX: origin.x,
    fromY: origin.y,
    toX: destination.x,
    toY: destination.y,
    toParcelId: args.toParcelId.value,
    departSimMs: state.clock.simMs,
    arriveSimMs: state.clock.simMs + quote.travelTicks * SIM_MS_PER_TICK,
    travelTicks: quote.travelTicks,
    freight: quote.freight,
  };
  return {
    ...state,
    inventories,
    siteBins,
    supplyHauls: [...listSupplyHauls(state), haul],
    players: {
      ...state.players,
      [player.id]: { ...player, cash: player.cash - quote.freight },
    },
    pnl: {
      ...state.pnl,
      [player.id]: addPnL(state.pnl[player.id] ?? emptyPnL(), { transportCost: quote.freight }),
    },
  };
}

export function settleSupplyHauls(state: WorldState): WorldState {
  const hauls = listSupplyHauls(state);
  if (hauls.length === 0) {
    return state;
  }
  const due = hauls.filter((haul) => state.clock.simMs >= haul.arriveSimMs);
  if (due.length === 0) {
    return state;
  }
  let inventories = state.inventories;
  let siteBins = { ...(state.siteBins ?? {}) };
  for (const haul of due) {
    const site = state.sites[haul.toParcelId];
    if (!site || site.phase !== 'complete' || site.ownerId !== haul.ownerId) {
      inventories = {
        ...inventories,
        [haul.ownerId]: addItem(inventories[haul.ownerId] ?? {}, haul.itemId, haul.quantity),
      };
      continue;
    }
    siteBins = {
      ...siteBins,
      [haul.toParcelId]: addItem(siteBins[haul.toParcelId] ?? {}, haul.itemId, haul.quantity),
    };
  }
  return {
    ...state,
    inventories,
    siteBins,
    supplyHauls: hauls.filter((haul) => state.clock.simMs < haul.arriveSimMs),
  };
}

/** 拆除或轉手時，廠內料倉退回公司庫，避免料消失。 */
export function releaseSiteBin(state: WorldState, parcelKey: string): WorldState {
  const bin = state.siteBins?.[parcelKey];
  if (!bin) {
    return state;
  }
  let stock = getPlayerInventory(state, state.localPlayerId);
  for (const [itemId, qty] of Object.entries(bin)) {
    if (qty > 0) {
      stock = addItem(stock, itemId, qty);
    }
  }
  const siteBins = { ...state.siteBins };
  delete siteBins[parcelKey];
  return {
    ...state,
    inventories: { ...state.inventories, [state.localPlayerId]: stock },
    siteBins,
  };
}

export function listSupplyHaulViews(state: WorldState): SupplyHaulView[] {
  return listSupplyHauls(state).map((haul) => {
    const points = findPath(
      state.map,
      { x: haul.fromX, y: haul.fromY },
      { x: haul.toX, y: haul.toY },
    );
    const span = Math.max(1, haul.arriveSimMs - haul.departSimMs);
    const progress = Math.min(1, Math.max(0, (state.clock.simMs - haul.departSimMs) / span));
    const point = pointAlongPath(points, progress);
    return {
      id: haul.id,
      label: `送${ITEMS[haul.itemId].nameZh} ${haul.quantity}`,
      x: point.x,
      y: point.y,
      points,
    };
  });
}

export interface SupplyStockLine {
  readonly itemId: ItemId;
  readonly nameZh: string;
  readonly quantity: number;
}

export interface SiteInputCover {
  readonly itemId: ItemId;
  readonly nameZh: string;
  readonly perCycle: number;
  readonly inBin: number;
  readonly inbound: number;
  readonly inCompany: number;
  readonly shortfall: number;
}

export interface SiteSupplyView {
  readonly parcelKey: string;
  readonly x: number;
  readonly y: number;
  readonly factoryNameZh: string;
  readonly recipeNameZh: string | null;
  readonly waiting: boolean;
  readonly bin: readonly SupplyStockLine[];
  readonly inbound: readonly (SupplyStockLine & { readonly ticksLeft: number })[];
  readonly inputs: readonly SiteInputCover[];
}

export interface RestockPart {
  readonly itemId: ItemId;
  readonly nameZh: string;
  readonly quantity: number;
  readonly freight: number;
  readonly travelTicks: number;
}

export function listSiteSupply(state: WorldState): SiteSupplyView[] {
  const playerId = state.localPlayerId;
  const company = getPlayerInventory(state, playerId);
  const hauls = listSupplyHauls(state).filter((haul) => haul.ownerId === playerId);
  const views: SiteSupplyView[] = [];
  for (const parcel of state.map.parcels) {
    if (parcel.ownerId !== playerId) {
      continue;
    }
    const site = state.sites[parcel.id.value];
    if (!site || site.phase !== 'complete') {
      continue;
    }
    const line = getProductionLine(state, parcel.id);
    const recipe = line && line.status !== 'stopped' ? RECIPES[line.recipeId] : undefined;
    const bin = siteBin(state, parcel.id.value);
    const incoming = hauls.filter((haul) => haul.toParcelId === parcel.id.value);
    const inboundQty = new Map<string, number>();
    for (const haul of incoming) {
      inboundQty.set(haul.itemId, (inboundQty.get(haul.itemId) ?? 0) + haul.quantity);
    }
    views.push({
      parcelKey: parcel.id.value,
      x: parcel.x,
      y: parcel.y,
      factoryNameZh: FACTORY_TYPES[site.factoryTypeId].nameZh,
      recipeNameZh: recipe?.nameZh ?? null,
      waiting: line?.status === 'waiting_inputs',
      bin: stockLines(bin),
      inbound: incoming.map((haul) => ({
        itemId: haul.itemId,
        nameZh: ITEMS[haul.itemId].nameZh,
        quantity: haul.quantity,
        ticksLeft: Math.max(0, Math.ceil((haul.arriveSimMs - state.clock.simMs) / SIM_MS_PER_TICK)),
      })),
      inputs: (recipe?.inputs ?? []).map((input) => {
        const inBin = getItemQty(bin, input.itemId);
        const inbound = inboundQty.get(input.itemId) ?? 0;
        return {
          itemId: input.itemId,
          nameZh: ITEMS[input.itemId].nameZh,
          perCycle: input.quantity,
          inBin,
          inbound,
          inCompany: getItemQty(company, input.itemId),
          shortfall: Math.max(0, input.quantity - inBin - inbound),
        };
      }),
    });
  }
  return views;
}

export function quoteRestock(
  state: WorldState,
  parcelId: ParcelId,
): { ok: true; freight: number; lines: readonly RestockPart[] } | { ok: false; reason: string } {
  const view = listSiteSupply(state).find((entry) => entry.parcelKey === parcelId.value);
  if (!view) {
    return { ok: false, reason: '只能補自己的完工建物' };
  }
  if (!view.recipeNameZh) {
    return { ok: false, reason: '先排產，再補一輪料' };
  }
  if (view.inputs.length === 0) {
    return { ok: false, reason: '這條線直接吃礦脈' };
  }
  const shortages = view.inputs.filter((input) => input.shortfall > 0);
  if (shortages.length === 0) {
    return { ok: false, reason: '這一輪的料已經在倉或在路上' };
  }
  const lines: RestockPart[] = [];
  for (const input of shortages) {
    const quote = quoteSupplyDispatch(state, {
      toParcelId: parcelId,
      itemId: input.itemId,
      quantity: input.shortfall,
    });
    if (!quote.ok) {
      return quote;
    }
    lines.push({
      itemId: input.itemId,
      nameZh: input.nameZh,
      quantity: input.shortfall,
      freight: quote.freight,
      travelTicks: quote.travelTicks,
    });
  }
  const freight = lines.reduce((sum, line) => sum + line.freight, 0);
  const player = state.players[state.localPlayerId];
  if (!player || player.cash < freight) {
    return { ok: false, reason: '運費不足' };
  }
  return { ok: true, freight, lines };
}

/** 依目前配方，把差一輪的料從公司庫一次送進料倉。料夠或沒排產時不改狀態。 */
export function restockSite(state: WorldState, parcelId: ParcelId): WorldState {
  const quote = quoteRestock(state, parcelId);
  if (!quote.ok) {
    return state;
  }
  let next = state;
  for (const line of quote.lines) {
    const dispatched = dispatchSupply(next, {
      toParcelId: parcelId,
      itemId: line.itemId,
      quantity: line.quantity,
    });
    if (dispatched === next) {
      return state;
    }
    next = dispatched;
  }
  return next;
}

function stockLines(stock: PlayerStock): SupplyStockLine[] {
  return Object.entries(stock)
    .filter((entry): entry is [ItemId, number] => entry[1] > 0 && entry[0] in ITEMS)
    .map(([itemId, quantity]) => ({ itemId, nameZh: ITEMS[itemId].nameZh, quantity }));
}

export function mergeStock(company: PlayerStock, bin: PlayerStock): PlayerStock {
  let next = company;
  for (const [itemId, qty] of Object.entries(bin)) {
    if (qty > 0) {
      next = addItem(next, itemId, qty);
    }
  }
  return next;
}

/** 消耗先扣廠內料倉，產出仍進公司庫。料倉是空的時呼叫端應走原路徑。 */
export function splitAfterTick(
  company: PlayerStock,
  bin: PlayerStock,
  before: PlayerStock,
  after: PlayerStock,
): { company: PlayerStock; bin: PlayerStock } {
  let nextCompany = company;
  let nextBin = bin;
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const itemId of keys) {
    const delta = getItemQty(after, itemId) - getItemQty(before, itemId);
    if (delta < 0) {
      let left = -delta;
      const fromBin = Math.min(getItemQty(nextBin, itemId), left);
      if (fromBin > 0) {
        nextBin = removeItem(nextBin, itemId, fromBin) ?? nextBin;
        left -= fromBin;
      }
      if (left > 0) {
        nextCompany = removeItem(nextCompany, itemId, left) ?? nextCompany;
      }
    } else if (delta > 0) {
      nextCompany = addItem(nextCompany, itemId, delta);
    }
  }
  return { company: nextCompany, bin: nextBin };
}
