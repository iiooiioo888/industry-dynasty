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

/** 通行成本：道路與城市核心便宜，一般土地較貴，沒有地塊的格子最貴。 */
const ROAD_COST = 1;
const LAND_COST = 4;
const MISSING_COST = 8;

interface Grid {
  readonly width: number;
  readonly height: number;
  /** 每個格子的通行成本，索引為 `y * width + x`。 */
  readonly cost: Int32Array;
}

/**
 * 由地塊陣列推導的格線快取。
 *
 * 用 `map.parcels` 的**陣列 identity** 當鍵：每次地塊變更（蓋路、完工、拆除）
 * 都會由 `updateParcelInMap` 產生新陣列，因此快取自動失效，不需要手動清除。
 */
const gridCache = new WeakMap<readonly Parcel[], Grid>();

function gridOf(map: GameMap): Grid {
  const cached = gridCache.get(map.parcels);
  if (cached !== undefined) {
    return cached;
  }
  const { width, height } = map.size;
  const cost = new Int32Array(width * height).fill(MISSING_COST);
  for (const parcel of map.parcels) {
    if (parcel.x < 0 || parcel.y < 0 || parcel.x >= width || parcel.y >= height) {
      continue;
    }
    cost[parcel.y * width + parcel.x] =
      parcel.role === 'road' || parcel.role === 'city-hub' ? ROAD_COST : LAND_COST;
  }
  const grid: Grid = { width, height, cost };
  gridCache.set(map.parcels, grid);
  return grid;
}

/**
 * 已算過的路徑快取，同樣以地塊陣列 identity 為鍵。
 * 地圖可變範圍是 `width * height`，因此鍵 `from * cells + to` 不會碰撞。
 */
const pathCache = new WeakMap<readonly Parcel[], Map<number, TilePoint[]>>();

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
 *
 * ## 為什麼不是 Map + 線性掃描
 *
 * 這個函式在模擬裡是絕對熱點（CPU profile 佔 42%）。原本每次呼叫都
 * 重建地塊 `Map`、每格用 `${x},${y}` 字串鍵、open list 用陣列線性找最小值
 * 再用 `includes` 去重，等於 O(V²) 加上大量字串配置。
 *
 * 現在改成：格線成本用 `Int32Array` 快取、節點用整數鍵、
 * open list 用二元最小堆（支援 decrease-key）、結果按起訖對快取。
 *
 * **輸出必須與舊實作逐點相同**，因為 `shipmentTravelTicks` 用
 * `path.length - 1` 決定運輸時間；路徑一變，平衡數字就全部跟著動。
 * 為此堆的比較序刻意對齊舊行為：先比 `g + h`，同分時比**插入順序**
 * （舊版 `open` 陣列的位置即插入順序），且 decrease-key 沿用原本的插入序。
 */
export function findPath(map: GameMap, from: TilePoint, to: TilePoint): TilePoint[] {
  if (from.x === to.x && from.y === to.y) {
    return [{ x: from.x, y: from.y }];
  }

  const grid = gridOf(map);
  const cells = grid.width * grid.height;
  const fromKey = from.y * grid.width + from.x;
  const toKey = to.y * grid.width + to.x;
  const cacheKey = fromKey * cells + toKey;

  let memo = pathCache.get(map.parcels);
  if (memo === undefined) {
    memo = new Map();
    pathCache.set(map.parcels, memo);
  }
  const hit = memo.get(cacheKey);
  if (hit !== undefined) {
    return hit;
  }

  const path = search(grid, from, to, fromKey, toKey);
  memo.set(cacheKey, path);
  return path;
}

function search(
  grid: Grid,
  from: TilePoint,
  to: TilePoint,
  startKey: number,
  goalKey: number,
): TilePoint[] {
  const { width, cost } = grid;
  const cells = width * grid.height;

  const gScore = new Float64Array(cells).fill(Number.POSITIVE_INFINITY);
  const fScore = new Float64Array(cells).fill(Number.POSITIVE_INFINITY);
  const parent = new Int32Array(cells).fill(-1);
  /** 節點在堆中的索引；-1 表示不在堆中（未加入或已弹出）。 */
  const heapPos = new Int32Array(cells).fill(-1);
  /** 節點目前這一輪的插入序，用來重現舊版的同分取捨。 */
  const order = new Int32Array(cells);

  const heap: number[] = [];
  let nextOrder = 0;

  const heuristic = (node: number): number => {
    const x = node % width;
    const y = (node - x) / width;
    return Math.abs(x - to.x) + Math.abs(y - to.y);
  };

  // 先比 f，同分比插入序 —— 完全對齊舊版「取 open 陣列中的第一個最小值」。
  const less = (a: number, b: number): boolean => {
    const fa = fScore[a] ?? Number.POSITIVE_INFINITY;
    const fb = fScore[b] ?? Number.POSITIVE_INFINITY;
    if (fa !== fb) {
      return fa < fb;
    }
    return (order[a] ?? 0) < (order[b] ?? 0);
  };

  const siftUp = (index: number): void => {
    let i = index;
    while (i > 0) {
      const parentIndex = (i - 1) >> 1;
      const node = heap[i]!;
      const parentNode = heap[parentIndex]!;
      if (!less(node, parentNode)) {
        break;
      }
      heap[i] = parentNode;
      heap[parentIndex] = node;
      heapPos[parentNode] = i;
      heapPos[node] = parentIndex;
      i = parentIndex;
    }
  };

  const siftDown = (index: number): void => {
    let i = index;
    for (;;) {
      const left = i * 2 + 1;
      const right = left + 1;
      let smallest = i;
      if (left < heap.length && less(heap[left]!, heap[smallest]!)) {
        smallest = left;
      }
      if (right < heap.length && less(heap[right]!, heap[smallest]!)) {
        smallest = right;
      }
      if (smallest === i) {
        return;
      }
      const a = heap[i]!;
      const b = heap[smallest]!;
      heap[i] = b;
      heap[smallest] = a;
      heapPos[a] = smallest;
      heapPos[b] = i;
      i = smallest;
    }
  };

  const push = (node: number): void => {
    order[node] = nextOrder;
    nextOrder += 1;
    heapPos[node] = heap.length;
    heap.push(node);
    siftUp(heap.length - 1);
  };

  const popMin = (): number | undefined => {
    const top = heap[0];
    if (top === undefined) {
      return undefined;
    }
    const last = heap.pop()!;
    heapPos[top] = -1;
    if (heap.length > 0) {
      heap[0] = last;
      heapPos[last] = 0;
      siftDown(0);
    }
    return top;
  };

  gScore[startKey] = 0;
  fScore[startKey] = heuristic(startKey);
  push(startKey);

  for (;;) {
    const current = popMin();
    if (current === undefined) {
      return manhattanPath(from, to);
    }
    if (current === goalKey) {
      const path: TilePoint[] = [];
      let cursor = current;
      for (;;) {
        const x = cursor % width;
        path.push({ x, y: (cursor - x) / width });
        if (cursor === startKey) {
          break;
        }
        const next = parent[cursor] ?? -1;
        if (next < 0) {
          break;
        }
        cursor = next;
      }
      path.reverse();
      return path;
    }

    const currentG = gScore[current] ?? Number.POSITIVE_INFINITY;
    const cx = current % width;
    const cy = (current - cx) / width;

    for (const dir of CARDINALS) {
      const nx = cx + dir.x;
      const ny = cy + dir.y;
      if (nx < 0 || ny < 0 || nx >= width || ny >= grid.height) {
        continue;
      }
      const nextKey = ny * width + nx;
      const tentative = currentG + (cost[nextKey] ?? MISSING_COST);
      if (tentative >= (gScore[nextKey] ?? Number.POSITIVE_INFINITY)) {
        continue;
      }
      gScore[nextKey] = tentative;
      parent[nextKey] = current;
      fScore[nextKey] = tentative + heuristic(nextKey);
      const position = heapPos[nextKey] ?? -1;
      if (position < 0) {
        push(nextKey);
      } else {
        // decrease-key：沿用原本的插入序，重現舊版「元素留在原陣列位置」
        siftUp(position);
      }
    }
  }
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
