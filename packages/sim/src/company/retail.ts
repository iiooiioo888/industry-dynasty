import { FACTORY_TYPES } from '../buildings/catalog.js';
import { addPnL, emptyPnL } from '../sales/pnl.js';
import { ITEMS, getItemQty, removeItem, type ItemId } from '../production/items.js';
import type { ParcelId } from '../types/map.js';
import type { Parcel } from '../types/map.js';
import type { WorldState } from '../world/state.js';
import type { MarketEvent } from './events.js';
import { readResearch } from './research.js';
import { rivalShareForCity, type RivalBook } from './rivals.js';
import { listStaff, shopkeeperSkillAt } from './staff.js';

export const CONSUMER_ITEM_IDS = ['tool-kit', 'wire-spool', 'sealant-coat'] as const;
export type ConsumerItemId = (typeof CONSUMER_ITEM_IDS)[number];

export const AD_POINT_COST = 200;

export interface ShelfPrice {
  readonly parcelId: string;
  readonly itemId: ConsumerItemId;
  readonly unitPrice: number;
}

export function isConsumerItem(itemId: string): itemId is ConsumerItemId {
  return (CONSUMER_ITEM_IDS as readonly string[]).includes(itemId);
}

export function listShelfPrices(state: WorldState): readonly ShelfPrice[] {
  return state.shelfPrices ?? [];
}

export function brandOf(state: WorldState): number {
  return state.brand ?? 0;
}

/** 廣告點數換來的門市量。上限 45%，不影響港區單價。 */
export function brandFactor(brand: number): number {
  return 1 + Math.min(0.45, Math.max(0, brand) * 0.02);
}

export function decayBrand(brand: number): number {
  return Math.floor(Math.max(0, brand) * 0.8);
}

/**
 * 售價相對錨點。高於錨點量下降，到 1.8 倍歸零；
 * 低於錨點量上升，但單價變薄。
 */
export function priceElasticity(unitPrice: number, anchor: number): number {
  if (anchor <= 0 || unitPrice <= 0) {
    return 0;
  }
  const ratio = unitPrice / anchor;
  if (ratio >= 1.8) {
    return 0;
  }
  if (ratio >= 1) {
    return Math.max(0, 1 - (ratio - 1) / 0.8);
  }
  return Math.min(1.6, 1 + (1 - ratio) * 0.7);
}

export function retailQuality(state: WorldState): number {
  const playerId = state.localPlayerId;
  const owned = state.map.parcels.filter((parcel) => parcel.ownerId === playerId);
  const richness =
    owned.length === 0
      ? 1
      : owned.reduce((sum, parcel) => sum + parcel.resource.richness, 0) / owned.length;
  let foreman = 0;
  for (const person of listStaff(state)) {
    if (person.role !== 'foreman' || !person.assignedParcelId) {
      continue;
    }
    const site = state.sites[person.assignedParcelId];
    if (site?.phase === 'complete' && FACTORY_TYPES[site.factoryTypeId].kind === 'works') {
      foreman = Math.max(foreman, person.skill);
    }
  }
  return 1.08 * (1 + (richness - 1) * 0.02) * (1 + foreman * 0.03);
}

export function shopkeeperFactor(skill: number): number {
  if (skill <= 0) {
    return 1;
  }
  return 1 + (skill - 1) * 0.06;
}

export function shelfUnitPrice(
  state: WorldState,
  parcelKey: string,
  itemId: ConsumerItemId,
): number {
  const listed = listShelfPrices(state).find(
    (price) => price.parcelId === parcelKey && price.itemId === itemId,
  );
  return listed?.unitPrice ?? ITEMS[itemId].unitValue;
}

export interface StoreDemandQuote {
  readonly units: number;
  readonly unitPrice: number;
  readonly elasticity: number;
}

export function quoteStoreItem(args: {
  parcel: Parcel;
  itemId: ConsumerItemId;
  unitPrice: number;
  quality: number;
  brand: number;
  rivals: RivalBook;
  shopkeeperSkill: number;
  retailMultiplier: number;
  cityId: string | null;
}): StoreDemandQuote {
  const anchor = ITEMS[args.itemId].unitValue;
  const elasticity = priceElasticity(args.unitPrice, anchor);
  const population = clamp01(args.parcel.populationDensity / 100);
  const road = clamp01(args.parcel.roadAccess);
  const city = clamp01(args.parcel.cityProximity);
  const base = 6 * population * (0.45 + 0.55 * road) * (0.7 + 0.3 * city);
  const openShare = 1 - rivalShareForCity(args.rivals, args.cityId);
  const units = Math.floor(
    base *
      elasticity *
      args.quality *
      brandFactor(args.brand) *
      openShare *
      shopkeeperFactor(args.shopkeeperSkill) *
      args.retailMultiplier,
  );
  return { units: Math.max(0, units), unitPrice: args.unitPrice, elasticity };
}

export function setShelfPrice(
  state: WorldState,
  parcelId: ParcelId,
  itemId: ConsumerItemId,
  unitPrice: number,
): WorldState {
  if (!Number.isInteger(unitPrice) || unitPrice <= 0) {
    return state;
  }
  const site = state.sites[parcelId.value];
  const parcel = state.map.parcels.find((entry) => entry.id.value === parcelId.value);
  if (
    !parcel ||
    parcel.ownerId !== state.localPlayerId ||
    !site ||
    site.phase !== 'complete' ||
    FACTORY_TYPES[site.factoryTypeId].kind !== 'store'
  ) {
    return state;
  }
  const projectId = researchIdForItem(itemId);
  if (!projectId || !readResearch(state).unlocked.includes(projectId)) {
    return state;
  }
  const rest = listShelfPrices(state).filter(
    (price) => !(price.parcelId === parcelId.value && price.itemId === itemId),
  );
  return {
    ...state,
    shelfPrices: [...rest, { parcelId: parcelId.value, itemId, unitPrice }],
  };
}

export function buyAdvert(state: WorldState, spend: number): WorldState {
  if (!Number.isInteger(spend) || spend < AD_POINT_COST) {
    return state;
  }
  const player = state.players[state.localPlayerId];
  if (!player || player.cash < spend) {
    return state;
  }
  const points = Math.floor(spend / AD_POINT_COST);
  const charged = points * AD_POINT_COST;
  const pnl = addPnL(state.pnl[player.id] ?? emptyPnL(), { maintenance: charged });
  return {
    ...state,
    brand: brandOf(state) + points,
    players: { ...state.players, [player.id]: { ...player, cash: player.cash - charged } },
    pnl: { ...state.pnl, [player.id]: pnl },
  };
}

export function settleStorefronts(
  state: WorldState,
  event: MarketEvent,
  rivals: RivalBook,
): WorldState {
  const playerId = state.localPlayerId;
  const player = state.players[playerId];
  if (!player) {
    return state;
  }
  const unlocked = new Set(readResearch(state).unlocked);
  const quality = retailQuality(state);
  let stock = state.inventories[playerId] ?? {};
  let cash = player.cash;
  let revenue = 0;

  const stores = Object.entries(state.sites)
    .filter(
      ([, site]) =>
        site.phase === 'complete' &&
        site.ownerId === playerId &&
        FACTORY_TYPES[site.factoryTypeId].kind === 'store',
    )
    .sort(([a], [b]) => a.localeCompare(b));

  for (const [parcelKey] of stores) {
    const parcel = state.map.parcels.find((entry) => entry.id.value === parcelKey);
    if (!parcel) {
      continue;
    }
    const cityId = cityIdForParcel(state, parcel);
    for (const itemId of CONSUMER_ITEM_IDS) {
      const projectId = researchIdForItem(itemId);
      if (!projectId || !unlocked.has(projectId)) {
        continue;
      }
      const unitPrice = shelfUnitPrice(state, parcelKey, itemId);
      const quote = quoteStoreItem({
        parcel,
        itemId,
        unitPrice,
        quality,
        brand: brandOf(state),
        rivals,
        shopkeeperSkill: shopkeeperSkillAt(state, parcelKey),
        retailMultiplier: event.retailMultiplier,
        cityId,
      });
      const sold = Math.min(quote.units, getItemQty(stock, itemId));
      if (sold <= 0) {
        continue;
      }
      const nextStock = removeItem(stock, itemId, sold);
      if (!nextStock) {
        continue;
      }
      stock = nextStock;
      const take = sold * unitPrice;
      cash += take;
      revenue += take;
    }
  }

  if (revenue === 0) {
    return state;
  }
  const pnl = addPnL(state.pnl[playerId] ?? emptyPnL(), { revenue });
  return {
    ...state,
    inventories: { ...state.inventories, [playerId]: stock },
    players: { ...state.players, [playerId]: { ...player, cash } },
    pnl: { ...state.pnl, [playerId]: pnl },
  };
}

function researchIdForItem(itemId: ConsumerItemId): string | null {
  if (itemId === 'tool-kit') {
    return 'civic-tools';
  }
  if (itemId === 'wire-spool') {
    return 'civic-wire';
  }
  if (itemId === 'sealant-coat') {
    return 'civic-seal';
  }
  return null;
}

function cityIdForParcel(state: WorldState, parcel: Parcel): string | null {
  if (!parcel.nearestCityName) {
    return null;
  }
  const city = state.map.cities.find((entry) => entry.name === parcel.nearestCityName);
  return city?.id ?? null;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function consumerAnchor(itemId: ItemId): number {
  return ITEMS[itemId].unitValue;
}
