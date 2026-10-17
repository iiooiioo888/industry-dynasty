import { ITEMS } from '../production/items.js';
import { MARKET_HUB, manhattanToMarket } from '../sales/market.js';
import { TRANSPORT_RATE_PER_TILE, transportCostPerUnit } from '../sales/ship-route.js';
import type { Parcel } from '../types/map.js';
import { SUPPLY_HUB } from '../production/logistics.js';
import { DEFAULT_WORLD_CONFIG, type WorldConfig } from './config.js';
import { findPath } from './pathfinding.js';
import type { WorldState } from './state.js';

/** 買地比較用的規劃報價。運費以基礎零件計，方便不同格子並列。 */
export interface ParcelPlanQuote {
  readonly x: number;
  readonly y: number;
  readonly populationDensity: number;
  readonly portDistance: number;
  readonly hubSteps: number;
  readonly freightPerUnit: number;
  readonly landTax: number;
}

export function quoteParcelPlan(
  state: WorldState,
  parcel: Parcel,
  config: WorldConfig = DEFAULT_WORLD_CONFIG,
): ParcelPlanQuote {
  const hubPath = findPath(
    state.map,
    { x: parcel.x, y: parcel.y },
    { x: SUPPLY_HUB.x, y: SUPPLY_HUB.y },
  );
  return {
    x: parcel.x,
    y: parcel.y,
    populationDensity: parcel.populationDensity,
    portDistance: manhattanToMarket(parcel),
    hubSteps: Math.max(0, hubPath.length - 1),
    freightPerUnit: transportCostPerUnit(
      parcel,
      TRANSPORT_RATE_PER_TILE,
      ITEMS['basic-part'].unitValue,
    ),
    landTax: config.landTaxPerTick,
  };
}

export const PLAN_PORT = MARKET_HUB;
