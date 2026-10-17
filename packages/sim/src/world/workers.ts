import { SUPPLY_HUB } from '../production/logistics.js';
import { RECIPES } from '../production/recipes.js';
import type { ProductionLine } from '../production/production-line.js';
import { SIM_MS_PER_TICK } from './clock.js';
import { findPath, pointAlongPath, type TilePoint } from './pathfinding.js';
import type { WorldState } from './state.js';

export type WorkerActivity = 'traveling' | 'working' | 'idle';

/** 去程、在樞紐、回程、進廠作業。閒置是停在當下那一段。 */
export type WorkerLeg = 'outbound' | 'hub' | 'return' | 'working' | 'idle';

export interface MapActor {
  readonly id: string;
  readonly parcelKey: string;
  readonly x: number;
  readonly y: number;
  readonly activity: WorkerActivity;
  readonly leg: WorkerLeg;
  /** 地圖上的短狀態：去程、樞紐、回程、作業、閒置。 */
  readonly status: string;
  readonly label: string;
}

const LEG_STATUS: Record<Exclude<WorkerLeg, 'idle'>, string> = {
  outbound: '去程',
  hub: '樞紐',
  return: '回程',
  working: '作業',
};

function homeOf(parcelKey: string): TilePoint | undefined {
  const [xText, yText] = parcelKey.split(',');
  const x = Number(xText);
  const y = Number(yText);
  if (!Number.isInteger(x) || !Number.isInteger(y)) {
    return undefined;
  }
  return { x, y };
}

/** 工廠 → 供應樞紐 → 工廠。走完正好回到原地，下一週期不會瞬移。 */
export function supplyRoundTrip(state: WorldState, home: TilePoint): readonly TilePoint[] {
  const hub = { x: SUPPLY_HUB.x, y: SUPPLY_HUB.y };
  const outbound = findPath(state.map, home, hub);
  const inbound = findPath(state.map, hub, home);
  if (inbound.length <= 1) {
    return outbound;
  }
  return [...outbound, ...inbound.slice(1)];
}

function travelProgress(line: ProductionLine, simMs: number): number {
  if (line.travelTicks <= 0) {
    return 1;
  }
  if (line.status !== 'running') {
    return Math.min(1, (line.progressTicks + line.stallTicks) / line.travelTicks);
  }
  if (line.progressTicks >= line.travelTicks) {
    return 1;
  }
  const elapsed = Math.max(0, simMs - line.progressAnchorMs);
  const fraction = Math.min(1, elapsed / SIM_MS_PER_TICK);
  return Math.min(1, (line.progressTicks + fraction) / line.travelTicks);
}

function activityOf(line: ProductionLine): WorkerActivity {
  if (line.status === 'waiting_inputs') {
    return 'idle';
  }
  if (line.phase === 'traveling' && line.progressTicks < line.travelTicks) {
    return 'traveling';
  }
  return 'working';
}

function placeOnTrip(
  state: WorldState,
  home: TilePoint,
  fraction: number,
): { point: TilePoint; leg: Exclude<WorkerLeg, 'idle'> } {
  if (fraction >= 1) {
    return { point: home, leg: 'working' };
  }
  const hub = { x: SUPPLY_HUB.x, y: SUPPLY_HUB.y };
  const outbound = findPath(state.map, home, hub);
  const inbound = findPath(state.map, hub, home);
  if (fraction < 0.4) {
    return { point: pointAlongPath(outbound, fraction / 0.4), leg: 'outbound' };
  }
  if (fraction < 0.6) {
    return { point: hub, leg: 'hub' };
  }
  return { point: pointAlongPath(inbound, (fraction - 0.6) / 0.4), leg: 'return' };
}

function stagger(actors: MapActor[]): MapActor[] {
  const groups = new Map<string, number[]>();
  actors.forEach((actor, index) => {
    const key = `${Math.round(actor.x)},${Math.round(actor.y)}`;
    const list = groups.get(key) ?? [];
    list.push(index);
    groups.set(key, list);
  });
  return actors.map((actor, index) => {
    const key = `${Math.round(actor.x)},${Math.round(actor.y)}`;
    const group = groups.get(key) ?? [index];
    if (group.length < 2) {
      return actor;
    }
    const slot = Math.max(0, group.indexOf(index));
    const angle = (slot / group.length) * Math.PI * 2;
    const radius = 0.28;
    return {
      ...actor,
      x: actor.x + Math.cos(angle) * radius,
      y: actor.y + Math.sin(angle) * radius,
    };
  });
}

export function listMapActors(state: WorldState): MapActor[] {
  const actors: MapActor[] = [];
  for (const [parcelKey, line] of Object.entries(state.productionLines)) {
    if (line.status === 'stopped') {
      continue;
    }
    const home = homeOf(parcelKey);
    if (!home) {
      continue;
    }
    const activity = activityOf(line);
    const placed = placeOnTrip(state, home, travelProgress(line, state.clock.simMs));
    const leg: WorkerLeg = activity === 'idle' ? 'idle' : placed.leg;
    const workingAtFactory =
      leg === 'working' || (activity === 'working' && line.progressTicks >= line.travelTicks);
    const point = workingAtFactory ? home : placed.point;
    const recipeName = RECIPES[line.recipeId]?.nameZh ?? '產線';
    const status = activity === 'idle' ? '閒置' : LEG_STATUS[placed.leg];
    actors.push({
      id: `worker:${parcelKey}`,
      parcelKey,
      x: point.x,
      y: point.y,
      activity,
      leg: activity === 'idle' ? 'idle' : placed.leg,
      status,
      label: `${status} · ${recipeName}`,
    });
  }
  return stagger(actors);
}
