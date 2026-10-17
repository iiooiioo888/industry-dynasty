import { getAdjacentParcelIds } from '../buildings/adjacency.js';
import { FACTORY_TYPES, type FactoryTypeId } from '../buildings/catalog.js';
import type { Parcel, ParcelId } from '../types/map.js';
import type { AuctionLot } from '../types/auction.js';
import { minNextBid } from '../world/auction-logic.js';
import { RECIPES } from '../production/recipes.js';
import { ITEMS } from '../production/items.js';
import { findParcel, getPlayerHoldings, type WorldState } from '../world/state.js';
import type { WorldAction } from '../world/actions.js';
import type { Rng } from './rng.js';
import type { StrategyId } from './types.js';

const CLUSTER_TARGET = 4;
const ASSEMBLY_TARGET = 2;
const SPECULATOR_TARGET = 12;
const CLUSTER_RESERVE_TICKS = 3;
const ASSEMBLY_RESERVE_TICKS = 6;
const CLUSTER_PREMIUM = 320;
const ASSEMBLY_PREMIUM = 200;

const DIAGONAL_OFFSETS = [
  { dx: 1, dy: 1 },
  { dx: 1, dy: -1 },
  { dx: -1, dy: 1 },
  { dx: -1, dy: -1 },
];

export interface StrategyContext {
  readonly state: WorldState;
  readonly playerId: string;
  readonly rng: Rng;
  readonly landTaxPerTick: number;
}

export function bidLimit(strategy: StrategyId): number {
  switch (strategy) {
    case 'speculator':
      return 4;
    case 'cluster':
      return 2;
    default:
      return 1;
  }
}

export function chooseBid(strategy: StrategyId, ctx: StrategyContext): WorldAction | null {
  switch (strategy) {
    case 'cluster':
      return chooseClusterBid(ctx);
    case 'rapid-assembly':
      return chooseAssemblyBid(ctx);
    case 'speculator':
      return chooseSpeculatorBid(ctx);
    case 'random':
      return chooseRandomBid(ctx);
    default:
      return null;
  }
}

export function chooseBuilds(strategy: StrategyId, ctx: StrategyContext): WorldAction[] {
  switch (strategy) {
    case 'cluster':
      return chooseTypedBuilds(ctx, 'workshop', CLUSTER_TARGET, CLUSTER_RESERVE_TICKS);
    case 'rapid-assembly':
      return chooseTypedBuilds(ctx, 'assembly-plant', ASSEMBLY_TARGET, ASSEMBLY_RESERVE_TICKS);
    case 'speculator':
      return [];
    case 'random':
      return chooseRandomBuilds(ctx);
    default:
      return [];
  }
}

function chooseClusterBid(ctx: StrategyContext): WorldAction | null {
  if (holdings(ctx).length >= CLUSTER_TARGET) {
    return null;
  }

  let best: { parcel: Parcel; amount: number; score: number; distance: number } | null = null;
  for (const lot of openLots(ctx.state)) {
    if (lot.highBidderId === ctx.playerId) {
      continue;
    }
    const parcel = findParcel(ctx.state, lot.parcelId);
    if (!parcel) {
      continue;
    }
    const score = proximityScore(ctx.state, parcel, ctx.playerId);
    const amount = affordableAmount(
      ctx,
      lot,
      score > 0 ? CLUSTER_PREMIUM : 0,
      CLUSTER_RESERVE_TICKS,
    );
    if (amount === null) {
      continue;
    }
    const distance = meanDistanceToOwned(ctx, parcel);
    if (
      !best ||
      score > best.score ||
      (score === best.score && distance < best.distance) ||
      (score === best.score && distance === best.distance && parcelComesFirst(parcel, best.parcel))
    ) {
      best = { parcel, amount, score, distance };
    }
  }

  return best ? bidAction(best.parcel.id, best.amount) : null;
}

function chooseAssemblyBid(ctx: StrategyContext): WorldAction | null {
  if (holdings(ctx).length >= ASSEMBLY_TARGET) {
    return null;
  }

  let best: { parcel: Parcel; amount: number; distance: number } | null = null;
  for (const lot of openLots(ctx.state)) {
    if (lot.highBidderId === ctx.playerId) {
      continue;
    }
    const parcel = findParcel(ctx.state, lot.parcelId);
    if (!parcel) {
      continue;
    }
    const amount = affordableAmount(ctx, lot, ASSEMBLY_PREMIUM, ASSEMBLY_RESERVE_TICKS);
    if (amount === null) {
      continue;
    }
    const distance = centerDistance(ctx.state, parcel);
    if (
      !best ||
      distance < best.distance ||
      (distance === best.distance && parcelComesFirst(parcel, best.parcel))
    ) {
      best = { parcel, amount, distance };
    }
  }

  return best ? bidAction(best.parcel.id, best.amount) : null;
}

function chooseSpeculatorBid(ctx: StrategyContext): WorldAction | null {
  const owned = holdings(ctx).length;
  const pending = pendingBids(ctx.state, ctx.playerId);
  if (owned + pending >= SPECULATOR_TARGET) {
    return null;
  }

  const lots = openLots(ctx.state)
    .filter((lot) => lot.highBidderId === null)
    .sort((a, b) => a.minPrice - b.minPrice || a.parcelId.value.localeCompare(b.parcelId.value));

  for (const lot of lots) {
    const parcel = findParcel(ctx.state, lot.parcelId);
    if (!parcel) {
      continue;
    }
    const amount = affordableAmount(ctx, lot, 0, 0);
    if (amount === null) {
      continue;
    }
    return bidAction(parcel.id, amount);
  }
  return null;
}

function chooseRandomBid(ctx: StrategyContext): WorldAction | null {
  const roll = ctx.rng();
  if (roll >= 0.55) {
    return null;
  }

  const lots = openLots(ctx.state).filter((lot) => lot.highBidderId !== ctx.playerId);
  if (lots.length === 0) {
    return null;
  }
  const lot = lots[Math.floor(ctx.rng() * lots.length)];
  if (!lot) {
    return null;
  }
  const parcel = findParcel(ctx.state, lot.parcelId);
  if (!parcel) {
    return null;
  }
  const premium = ctx.rng() < 0.35 ? 80 : 0;
  const amount = affordableAmount(ctx, lot, premium, 1);
  return amount === null ? null : bidAction(parcel.id, amount);
}

/**
 * 這塊地是否真的能讓這型工廠**賺到錢**。
 *
 * 兩個條件缺一不可：
 * 1. 有對應的開採配方（`extract-iron` 只能在 `iron-vein` 上跑），
 *    且該配方能在這型工廠執行。
 * 2. 產出**可販售**。P0 起五種開採產出都可賣給港區，煤／銅／石英不再是死路。
 *    仍排除產出不可販售的配方，避免工廠只做賣不掉的中間件。
 */
function parcelCanProduce(parcel: Parcel, factoryTypeId: FactoryTypeId): boolean {
  return Object.values(RECIPES).some(
    (recipe) =>
      recipe.sourceKind === parcel.resource.kind &&
      recipe.inputs.length === 0 &&
      ITEMS[recipe.outputItemId].sellable &&
      (recipe.buildings as readonly string[]).includes(factoryTypeId),
  );
}

function chooseTypedBuilds(
  ctx: StrategyContext,
  factoryTypeId: FactoryTypeId,
  target: number,
  reserveTicks: number,
): WorldAction[] {
  const cost = FACTORY_TYPES[factoryTypeId].buildCost;
  const existing = countSites(ctx.state, ctx.playerId);
  const parcels = buildableParcels(ctx)
    // 先排除永遠無法生產的地塊
    .filter((parcel) => parcelCanProduce(parcel, factoryTypeId))
    .sort((a, b) => {
      if (factoryTypeId === 'assembly-plant') {
        return centerDistance(ctx.state, a) - centerDistance(ctx.state, b) || coordOrder(a, b);
      }
      const scoreDelta =
        proximityScore(ctx.state, b, ctx.playerId) - proximityScore(ctx.state, a, ctx.playerId);
      return scoreDelta || coordOrder(a, b);
    });

  const actions: WorldAction[] = [];
  let remainingCash = cashOf(ctx) - committedBidTotal(ctx.state, ctx.playerId);
  for (const parcel of parcels) {
    if (existing + actions.length >= target) {
      break;
    }
    const reserve = (holdings(ctx).length || 1) * ctx.landTaxPerTick * reserveTicks;
    if (remainingCash < cost + reserve) {
      break;
    }
    actions.push({ type: 'START_BUILD', parcelId: parcel.id, factoryTypeId });
    remainingCash -= cost;
  }
  return actions;
}

function chooseRandomBuilds(ctx: StrategyContext): WorldAction[] {
  if (ctx.rng() >= 0.6) {
    return [];
  }
  const parcels = buildableParcels(ctx);
  if (parcels.length === 0) {
    return [];
  }
  const parcel = parcels[Math.floor(ctx.rng() * parcels.length)];
  if (!parcel) {
    return [];
  }
  const preferred: FactoryTypeId = ctx.rng() < 0.5 ? 'workshop' : 'assembly-plant';
  // 先看偏好的廠型能不能在這塊地賺錢；不行就換另一種，兩種都不行就不蓋。
  // 否則會蓋出「永遠不生產、只繳稅」的工廠（實測隨機策略每座工廠只創造
  // 3,700 營收，遠低於可行區位的 16,000+）。
  const viable: FactoryTypeId[] = parcelCanProduce(parcel, preferred)
    ? [preferred]
    : (['workshop', 'assembly-plant'] as const).filter((t) => parcelCanProduce(parcel, t));
  const factoryTypeId = viable[0];
  if (!factoryTypeId) {
    return [];
  }
  const cost = FACTORY_TYPES[factoryTypeId].buildCost;
  if (cashOf(ctx) < cost) {
    return [];
  }
  return [{ type: 'START_BUILD', parcelId: parcel.id, factoryTypeId }];
}

function bidAction(parcelId: ParcelId, amount: number): WorldAction {
  return { type: 'BID', parcelId, amount };
}

function holdings(ctx: StrategyContext): readonly Parcel[] {
  return getPlayerHoldings(ctx.state, ctx.playerId);
}

function cashOf(ctx: StrategyContext): number {
  return ctx.state.players[ctx.playerId]?.cash ?? 0;
}

function openLots(state: WorldState): AuctionLot[] {
  return state.auctionLots.filter((lot) => {
    if (lot.status !== 'open') {
      return false;
    }
    const parcel = findParcel(state, lot.parcelId);
    return parcel?.ownerId === null;
  });
}

function pendingBids(state: WorldState, playerId: string): number {
  return state.auctionLots.filter((lot) => lot.status === 'open' && lot.highBidderId === playerId)
    .length;
}

export function committedBidTotal(state: WorldState, playerId: string): number {
  let total = 0;
  for (const lot of state.auctionLots) {
    if (lot.status === 'open' && lot.highBidderId === playerId) {
      total += lot.highBid;
    }
  }
  return total;
}

function affordableAmount(
  ctx: StrategyContext,
  lot: AuctionLot,
  premiumCap: number,
  reserveTicks: number,
): number | null {
  const needed = minNextBid(lot);
  if (needed - lot.minPrice > premiumCap) {
    return null;
  }
  const owned = holdings(ctx).length;
  const reserve = Math.max(owned, reserveTicks > 0 ? 1 : 0) * ctx.landTaxPerTick * reserveTicks;
  const available = cashOf(ctx) - committedBidTotal(ctx.state, ctx.playerId) - reserve;
  if (available < needed) {
    return null;
  }
  return needed;
}

function buildableParcels(ctx: StrategyContext): Parcel[] {
  return holdings(ctx).filter(
    (parcel) => parcel.state === 'owned' && !ctx.state.sites[parcel.id.value],
  );
}

function countSites(state: WorldState, playerId: string): number {
  return Object.values(state.sites).filter((site) => site.ownerId === playerId).length;
}

function proximityScore(state: WorldState, parcel: Parcel, playerId: string): number {
  let score = 0;
  for (const neighborId of getAdjacentParcelIds(state.map, parcel)) {
    const neighbor = findParcel(state, neighborId);
    if (neighbor?.ownerId === playerId) {
      score += 3;
    }
  }
  for (const { dx, dy } of DIAGONAL_OFFSETS) {
    const neighbor = state.map.parcels.find(
      (item) => item.x === parcel.x + dx && item.y === parcel.y + dy,
    );
    if (neighbor?.ownerId === playerId) {
      score += 1;
    }
  }
  return score;
}

function meanDistanceToOwned(ctx: StrategyContext, parcel: Parcel): number {
  const owned = holdings(ctx);
  if (owned.length === 0) {
    return parcel.y * 100 + parcel.x;
  }
  const total = owned.reduce(
    (sum, item) => sum + Math.abs(item.x - parcel.x) + Math.abs(item.y - parcel.y),
    0,
  );
  return total / owned.length;
}

function centerDistance(state: WorldState, parcel: Parcel): number {
  const cx = (state.map.size.width - 1) / 2;
  const cy = (state.map.size.height - 1) / 2;
  return Math.abs(parcel.x - cx) + Math.abs(parcel.y - cy);
}

function parcelComesFirst(candidate: Parcel, current: Parcel): boolean {
  return coordOrder(candidate, current) < 0;
}

function coordOrder(a: Parcel, b: Parcel): number {
  return a.y - b.y || a.x - b.x;
}
