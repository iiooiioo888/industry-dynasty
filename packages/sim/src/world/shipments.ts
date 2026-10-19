import { craftedValue } from '../production/chain.js';
import { ITEMS } from '../production/items.js';
import type { Shipment } from '../sales/shipment.js';
import { addPnL, emptyPnL, evaluateScenario } from '../sales/index.js';
import { MARKET_HUB } from '../sales/market.js';
import type { Parcel } from '../types/map.js';
import { SIM_MS_PER_TICK } from './clock.js';
import { findPath, pointAlongPath, type TilePoint } from './pathfinding.js';
import type { Player, WorldState } from './state.js';

export type { Shipment };

export function listShipments(state: WorldState): readonly Shipment[] {
  return state.shipments ?? [];
}

export function shipmentTravelTicks(state: WorldState, parcel: Parcel): number {
  const path = findPath(
    state.map,
    { x: parcel.x, y: parcel.y },
    { x: MARKET_HUB.x, y: MARKET_HUB.y },
  );
  return Math.max(1, path.length - 1);
}

export function createShipment(args: {
  state: WorldState;
  ownerId: string;
  offerId: string;
  itemId: Shipment['itemId'];
  quantity: number;
  parcel: Parcel;
  grossRevenue: number;
  transportCost: number;
  netCash: number;
}): Shipment {
  const travelTicks = shipmentTravelTicks(args.state, args.parcel);
  const departSimMs = args.state.clock.simMs;
  return {
    id: `ship-${departSimMs}-${args.parcel.x}-${args.parcel.y}-${args.itemId}-${args.quantity}`,
    ownerId: args.ownerId,
    offerId: args.offerId,
    itemId: args.itemId,
    quantity: args.quantity,
    fromX: args.parcel.x,
    fromY: args.parcel.y,
    grossRevenue: args.grossRevenue,
    transportCost: args.transportCost,
    netCash: args.netCash,
    departSimMs,
    arriveSimMs: departSimMs + travelTicks * SIM_MS_PER_TICK,
    travelTicks,
  };
}

/** 模擬時間跨過到達時刻才入帳。同一刻只結一次。 */
export function settleArrivedShipments(state: WorldState): WorldState {
  const shipments = listShipments(state);
  if (shipments.length === 0) {
    return state;
  }
  const due = shipments.filter((shipment) => state.clock.simMs >= shipment.arriveSimMs);
  if (due.length === 0) {
    return state;
  }
  const pending = shipments.filter((shipment) => state.clock.simMs < shipment.arriveSimMs);
  let players = state.players;
  let pnl = state.pnl;
  for (const shipment of due) {
    const player = players[shipment.ownerId];
    if (!player) {
      continue;
    }
    const nextPlayer: Player = { ...player, cash: player.cash + shipment.netCash };
    players = { ...players, [player.id]: nextPlayer };
    pnl = {
      ...pnl,
      [player.id]: addPnL(pnl[player.id] ?? emptyPnL(), {
        revenue: shipment.grossRevenue,
        transportCost: shipment.transportCost,
      }),
    };
  }
  const localPnl = pnl[state.localPlayerId];
  return {
    ...state,
    players,
    pnl,
    shipments: pending,
    scenario: localPnl
      ? evaluateScenario(
          state.scenario,
          state.gameDay,
          localPnl,
          craftedValue(state.craftedTotals[state.localPlayerId]),
        )
      : state.scenario,
  };
}

export interface ShipmentView {
  readonly id: string;
  readonly itemNameZh: string;
  readonly quantity: number;
  readonly fromX: number;
  readonly fromY: number;
  readonly toX: number;
  readonly toY: number;
  readonly x: number;
  readonly y: number;
  readonly progress: number;
  readonly points: readonly TilePoint[];
  readonly ticksLeft: number;
  readonly label: string;
}

export function listShipmentViews(state: WorldState): ShipmentView[] {
  return listShipments(state).map((shipment) => {
    const points = findPath(
      state.map,
      { x: shipment.fromX, y: shipment.fromY },
      { x: MARKET_HUB.x, y: MARKET_HUB.y },
    );
    const span = Math.max(1, shipment.arriveSimMs - shipment.departSimMs);
    const progress = Math.min(1, Math.max(0, (state.clock.simMs - shipment.departSimMs) / span));
    const point = pointAlongPath(points, progress);
    const ticksLeft = Math.max(
      0,
      Math.ceil((shipment.arriveSimMs - state.clock.simMs) / SIM_MS_PER_TICK),
    );
    const itemNameZh = ITEMS[shipment.itemId].nameZh;
    return {
      id: shipment.id,
      itemNameZh,
      quantity: shipment.quantity,
      fromX: shipment.fromX,
      fromY: shipment.fromY,
      toX: MARKET_HUB.x,
      toY: MARKET_HUB.y,
      x: point.x,
      y: point.y,
      progress,
      points,
      ticksLeft,
      label: `出貨 ${itemNameZh}×${shipment.quantity} · 剩 ${ticksLeft} 刻`,
    };
  });
}
