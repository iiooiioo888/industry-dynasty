import { SUPPLY_HUB } from '../production/logistics.js';
import { RECIPES } from '../production/recipes.js';
import type { ProductionLine } from '../production/production-line.js';
import { SIM_MS_PER_TICK } from './clock.js';
import { findPath, pointAlongPath, type TilePoint } from './pathfinding.js';
import type { WorldState } from './state.js';

export type WorkerActivity = 'traveling' | 'working' | 'idle';

export interface MapActor {
  readonly id: string;
  readonly parcelKey: string;
  readonly x: number;
  readonly y: number;
  readonly activity: WorkerActivity;
  readonly label: string;
}

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
    const path = supplyRoundTrip(state, home);
    const activity = activityOf(line);
    const point =
      activity === 'working'
        ? (path[0] ?? home)
        : pointAlongPath(path, travelProgress(line, state.clock.simMs));
    const recipeName = RECIPES[line.recipeId]?.nameZh ?? '產線';
    const verb = activity === 'traveling' ? '趕路' : activity === 'working' ? '作業' : '閒置';
    actors.push({
      id: `worker:${parcelKey}`,
      parcelKey,
      x: point.x,
      y: point.y,
      activity,
      label: `工人${verb} · ${recipeName}`,
    });
  }
  return actors;
}
