import type { GameMap, Parcel } from '../types/map.js';

export interface TilePoint {
  readonly x: number;
  readonly y: number;
}

const CARDINALS = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
] as const;

function cellKey(x: number, y: number, width: number): number {
  return y * width + x;
}

function stepCost(parcel: Parcel | undefined): number {
  if (!parcel) {
    return 8;
  }
  if (parcel.role === 'road' || parcel.role === 'city-hub') {
    return 1;
  }
  return 4;
}

function manhattanPath(from: TilePoint, to: TilePoint): TilePoint[] {
  const path: TilePoint[] = [{ x: from.x, y: from.y }];
  let x = from.x;
  let y = from.y;
  const stepX = Math.sign(to.x - from.x);
  const stepY = Math.sign(to.y - from.y);
  while (x !== to.x) {
    x += stepX;
    path.push({ x, y });
  }
  while (y !== to.y) {
    y += stepY;
    path.push({ x, y });
  }
  return path;
}

/**
 * 四向最短路。道路與城市核心較便宜，所以工人會貼著路網走。
 * 格子始終可通行；找不到路時退回正交曼哈頓路徑。
 */
export function findPath(map: GameMap, from: TilePoint, to: TilePoint): TilePoint[] {
  if (from.x === to.x && from.y === to.y) {
    return [{ x: from.x, y: from.y }];
  }

  const { width, height } = map.size;
  const parcels = new Map<string, Parcel>();
  for (const parcel of map.parcels) {
    parcels.set(`${parcel.x},${parcel.y}`, parcel);
  }

  const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height;
  const startKey = cellKey(from.x, from.y, width);
  const goalKey = cellKey(to.x, to.y, width);
  const gScore = new Map<number, number>([[startKey, 0]]);
  const parent = new Map<number, number>();
  const open: number[] = [startKey];

  while (open.length > 0) {
    let bestIndex = 0;
    let bestScore = Number.POSITIVE_INFINITY;
    for (let index = 0; index < open.length; index += 1) {
      const node = open[index] ?? startKey;
      const nx = node % width;
      const ny = Math.floor(node / width);
      const score =
        (gScore.get(node) ?? Number.POSITIVE_INFINITY) + Math.abs(nx - to.x) + Math.abs(ny - to.y);
      if (score < bestScore) {
        bestScore = score;
        bestIndex = index;
      }
    }

    const current = open.splice(bestIndex, 1)[0];
    if (current === undefined) {
      break;
    }
    if (current === goalKey) {
      const path: TilePoint[] = [];
      let cursor: number | undefined = current;
      while (cursor !== undefined) {
        path.push({ x: cursor % width, y: Math.floor(cursor / width) });
        if (cursor === startKey) {
          break;
        }
        cursor = parent.get(cursor);
      }
      path.reverse();
      return path;
    }

    const cx = current % width;
    const cy = Math.floor(current / width);
    const currentG = gScore.get(current) ?? Number.POSITIVE_INFINITY;
    for (const dir of CARDINALS) {
      const nx = cx + dir.x;
      const ny = cy + dir.y;
      if (!inBounds(nx, ny)) {
        continue;
      }
      const nextKey = cellKey(nx, ny, width);
      const nextG = currentG + stepCost(parcels.get(`${nx},${ny}`));
      if (nextG >= (gScore.get(nextKey) ?? Number.POSITIVE_INFINITY)) {
        continue;
      }
      gScore.set(nextKey, nextG);
      parent.set(nextKey, current);
      if (!open.includes(nextKey)) {
        open.push(nextKey);
      }
    }
  }

  return manhattanPath(from, to);
}

/** 進度 0 在起點、1 在終點，中間依路徑長度線性插值。 */
export function pointAlongPath(path: readonly TilePoint[], progress: number): TilePoint {
  const first = path[0];
  if (!first) {
    return { x: 0, y: 0 };
  }
  if (path.length === 1) {
    return first;
  }
  const clamped = Math.min(1, Math.max(0, progress));
  const scaled = clamped * (path.length - 1);
  const index = Math.min(path.length - 2, Math.floor(scaled));
  const local = scaled - index;
  const from = path[index] ?? first;
  const to = path[index + 1] ?? from;
  return {
    x: from.x + (to.x - from.x) * local,
    y: from.y + (to.y - from.y) * local,
  };
}
