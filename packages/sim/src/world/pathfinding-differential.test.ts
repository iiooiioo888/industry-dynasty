import { describe, expect, it } from 'vitest';
import { findPath, type TilePoint } from './pathfinding.js';
import { createInitialWorld } from './create-world.js';
import type { GameMap, Parcel } from '../types/map.js';

/**
 * 舊實作（未優化）逐字保留，只為了做差異比對。
 * 見 `pathfinding.ts` 的說明：路徑長度決定運輸時間，
 * 所以優化後必須產生**逐點相同**的路徑。
 */
const OLD_CARDINALS = [
  { x: 1, y: 0 },
  { x: -1, y: 0 },
  { x: 0, y: 1 },
  { x: 0, y: -1 },
] as const;

function oldStepCost(parcel: Parcel | undefined): number {
  if (!parcel) return 8;
  if (parcel.role === 'road' || parcel.role === 'city-hub') return 1;
  return 4;
}

function oldCellKey(x: number, y: number, width: number): number {
  return y * width + x;
}

function oldManhattanPath(from: TilePoint, to: TilePoint): TilePoint[] {
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

function oldFindPath(map: GameMap, from: TilePoint, to: TilePoint): TilePoint[] {
  if (from.x === to.x && from.y === to.y) {
    return [{ x: from.x, y: from.y }];
  }
  const { width, height } = map.size;
  const parcels = new Map<string, Parcel>();
  for (const parcel of map.parcels) {
    parcels.set(`${parcel.x},${parcel.y}`, parcel);
  }
  const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height;
  const startKey = oldCellKey(from.x, from.y, width);
  const goalKey = oldCellKey(to.x, to.y, width);
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
    if (current === undefined) break;
    if (current === goalKey) {
      const path: TilePoint[] = [];
      let cursor: number | undefined = current;
      while (cursor !== undefined) {
        path.push({ x: cursor % width, y: Math.floor(cursor / width) });
        if (cursor === startKey) break;
        cursor = parent.get(cursor);
      }
      path.reverse();
      return path;
    }
    const cx = current % width;
    const cy = Math.floor(current / width);
    const currentG = gScore.get(current) ?? Number.POSITIVE_INFINITY;
    for (const dir of OLD_CARDINALS) {
      const nx = cx + dir.x;
      const ny = cy + dir.y;
      if (!inBounds(nx, ny)) continue;
      const nextKey = oldCellKey(nx, ny, width);
      const nextG = currentG + oldStepCost(parcels.get(`${nx},${ny}`));
      if (nextG >= (gScore.get(nextKey) ?? Number.POSITIVE_INFINITY)) continue;
      gScore.set(nextKey, nextG);
      parent.set(nextKey, current);
      if (!open.includes(nextKey)) open.push(nextKey);
    }
  }
  return oldManhattanPath(from, to);
}

function samePath(a: readonly TilePoint[], b: readonly TilePoint[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i]!.x !== b[i]!.x || a[i]!.y !== b[i]!.y) return false;
  }
  return true;
}

describe('findPath 優化前後必須逐點相同', () => {
  const world = createInitialWorld({});
  const map = world.map;
  const { width, height } = map.size;

  it('所有起訖點組合（含對角、長距離、同點）', () => {
    let compared = 0;
    let mismatches = 0;
    const examples: string[] = [];
    for (let fy = 0; fy < height; fy += 1) {
      for (let fx = 0; fx < width; fx += 1) {
        for (let ty = 0; ty < height; ty += 3) {
          for (let tx = 0; tx < width; tx += 3) {
            const from = { x: fx, y: fy };
            const to = { x: tx, y: ty };
            const fast = findPath(map, from, to);
            const slow = oldFindPath(map, from, to);
            compared += 1;
            if (!samePath(fast, slow)) {
              mismatches += 1;
              if (examples.length < 5) {
                examples.push(`(${fx},${fy})->(${tx},${ty}) new=${fast.length} old=${slow.length}`);
              }
            }
          }
        }
      }
    }
    console.log(`\n  比對 ${compared} 組起訖點，不一致 ${mismatches} 組`);
    for (const e of examples) console.log(`    ${e}`);
    expect(mismatches).toBe(0);
  });

  it('反向與環狀路徑也一致（A→B、B→A、A→A）', () => {
    const pts: TilePoint[] = [
      { x: 0, y: 0 },
      { x: 4, y: 4 },
      { x: width - 1, y: height - 1 },
      { x: Math.floor(width / 2), y: Math.floor(height / 2) },
      { x: 3, y: height - 1 },
    ];
    for (const a of pts) {
      for (const b of pts) {
        expect(
          samePath(findPath(map, a, b), oldFindPath(map, a, b)),
          `${a.x},${a.y}->${b.x},${b.y}`,
        ).toBe(true);
      }
    }
  });

  it('快取回傳的內容與首次計算相同', () => {
    const from = { x: 2, y: 2 };
    const to = { x: 10, y: 8 };
    const first = findPath(map, from, to);
    const second = findPath(map, from, to);
    expect(samePath(first, second)).toBe(true);
    expect(samePath(first, oldFindPath(map, from, to))).toBe(true);
  });
});
