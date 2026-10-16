import { MARKET_HUB, type GameMap, type Parcel, type WorldState } from '@industry-dynasty/sim';

/**
 * 地圖美術圖層解析。
 *
 * 世界狀態若已帶地理（可玩性 PR 的道路／城市／人口），只畫那些格子。
 * 尚未帶入時，使用 16×12 參考版面的占位，方便先看到圖、也方便之後改接。
 *
 * 可玩性可寫入下列任一形狀，本模組會自動改接、並停用占位：
 * - `parcel.role`: `'road'` | `'city-hub'`（以及 `'city'`）
 * - `parcel.populationDensity`: 數字，≥ {@link MAP_POP_DENSE_ART_THRESHOLD} 畫人口密集
 * - `map.cities`: `{ x, y }[]`
 * - `map.roads` 或 `map.roadSegments`: 格子、`{ cells | tiles }`，或軸對齊線段
 * - `map.denseZones`: 格子或 `{ cells | tiles }`
 *
 * 不在此計算需求、售價或物流。港區市場永遠對齊既有 `MARKET_HUB`。
 */

/** 人口密集圖層的顯示門檻（只決定要不要貼圖，不是需求公式）。 */
export const MAP_POP_DENSE_ART_THRESHOLD = 60;

const REF_WIDTH = 16;
const REF_HEIGHT = 12;

/** 占位城市：西灣、臨港、南站。真實 `map.cities` 出現後不再使用。 */
const PLACEHOLDER_CITIES = [
  { x: 3, y: 3 },
  { x: 11, y: 2 },
  { x: 8, y: 8 },
] as const;

const PLACEHOLDER_ROAD_ROWS = [3, 8] as const;
const PLACEHOLDER_ROAD_COLS = [8, 14] as const;

export interface CellFeatureArt {
  road: boolean;
  cityHub: boolean;
  cityBuilding: boolean;
  popDense: boolean;
  marketHub: boolean;
}

export interface MapFeatureArt {
  /** `world`：已接到地理資料。`placeholder`：可玩性尚未寫入，僅供美術占位。 */
  readonly source: 'world' | 'placeholder';
  readonly cells: ReadonlyMap<string, CellFeatureArt>;
}

interface CellRef {
  x: number;
  y: number;
}

function cellKey(x: number, y: number): string {
  return `${x},${y}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readFinite(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function inBounds(x: number, y: number, width: number, height: number): boolean {
  return x >= 0 && y >= 0 && x < width && y < height;
}

function scaleAxis(value: number, fromSpan: number, toSpan: number): number {
  if (toSpan <= 1) {
    return 0;
  }
  if (fromSpan <= 1) {
    return 0;
  }
  return Math.round((value * (toSpan - 1)) / (fromSpan - 1));
}

function emptyArt(): CellFeatureArt {
  return {
    road: false,
    cityHub: false,
    cityBuilding: false,
    popDense: false,
    marketHub: false,
  };
}

function ensure(cells: Map<string, CellFeatureArt>, x: number, y: number): CellFeatureArt {
  const key = cellKey(x, y);
  const existing = cells.get(key);
  if (existing) {
    return existing;
  }
  const created = emptyArt();
  cells.set(key, created);
  return created;
}

function mark(
  cells: Map<string, CellFeatureArt>,
  x: number,
  y: number,
  width: number,
  height: number,
  patch: Partial<CellFeatureArt>,
): void {
  if (!inBounds(x, y, width, height)) {
    return;
  }
  const art = ensure(cells, x, y);
  if (patch.road) art.road = true;
  if (patch.cityHub) art.cityHub = true;
  if (patch.cityBuilding) art.cityBuilding = true;
  if (patch.popDense) art.popDense = true;
  if (patch.marketHub) art.marketHub = true;
}

function readCell(record: Record<string, unknown>): CellRef | undefined {
  const x = readFinite(record, 'x');
  const y = readFinite(record, 'y');
  if (x === undefined || y === undefined) {
    return undefined;
  }
  return { x: Math.round(x), y: Math.round(y) };
}

function readCellList(value: unknown): CellRef[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const cells: CellRef[] = [];
  for (const entry of value) {
    if (!isRecord(entry)) {
      continue;
    }
    const cell = readCell(entry);
    if (cell) {
      cells.push(cell);
    }
  }
  return cells;
}

function orthogonalLine(from: CellRef, to: CellRef): CellRef[] {
  const cells: CellRef[] = [];
  const stepX = Math.sign(to.x - from.x);
  const stepY = Math.sign(to.y - from.y);
  let x = from.x;
  let y = from.y;
  cells.push({ x, y });
  while (x !== to.x) {
    x += stepX;
    cells.push({ x, y });
  }
  while (y !== to.y) {
    y += stepY;
    cells.push({ x, y });
  }
  return cells;
}

function cellsFromRoadValue(value: unknown): CellRef[] {
  if (!isRecord(value)) {
    return [];
  }
  const direct = readCell(value);
  if (direct && !Array.isArray(value.cells) && !Array.isArray(value.tiles)) {
    return [direct];
  }
  const listed = readCellList(value.cells ?? value.tiles ?? value.parcels);
  if (listed.length > 0) {
    return listed;
  }
  const from = isRecord(value.from) ? value.from : undefined;
  const to = isRecord(value.to) ? value.to : undefined;
  if (from && to) {
    const start = readCell(from);
    const end = readCell(to);
    if (start && end) {
      return orthogonalLine(start, end);
    }
  }
  const x1 = readFinite(value, 'x1');
  const y1 = readFinite(value, 'y1');
  const x2 = readFinite(value, 'x2');
  const y2 = readFinite(value, 'y2');
  if (x1 !== undefined && y1 !== undefined && x2 !== undefined && y2 !== undefined) {
    return orthogonalLine(
      { x: Math.round(x1), y: Math.round(y1) },
      { x: Math.round(x2), y: Math.round(y2) },
    );
  }
  return [];
}

function cellsFromZone(value: unknown): CellRef[] {
  if (!isRecord(value)) {
    return [];
  }
  const nested = readCellList(value.cells ?? value.tiles ?? value.parcels);
  if (nested.length > 0) {
    return nested;
  }
  return readCellList([value]);
}

interface WorldGeography {
  roads: CellRef[];
  cities: CellRef[];
  popDense: CellRef[];
  present: boolean;
}

function readWorldGeography(map: GameMap): WorldGeography {
  const extra = map as GameMap & Record<string, unknown>;
  const roads: CellRef[] = [];
  const cities: CellRef[] = [];
  const popDense: CellRef[] = [];
  let present = false;

  const cityList = readCellList(extra.cities);
  if (cityList.length > 0) {
    present = true;
    cities.push(...cityList);
  }

  for (const key of ['roads', 'roadSegments'] as const) {
    const list = extra[key];
    if (!Array.isArray(list) || list.length === 0) {
      continue;
    }
    present = true;
    for (const segment of list) {
      roads.push(...cellsFromRoadValue(segment));
    }
  }

  const zones = extra.denseZones;
  if (Array.isArray(zones) && zones.length > 0) {
    present = true;
    for (const zone of zones) {
      popDense.push(...cellsFromZone(zone));
    }
  }

  for (const parcel of map.parcels) {
    const record = parcel as Parcel & Record<string, unknown>;
    const role = typeof record.role === 'string' ? record.role : undefined;
    const density = readFinite(record, 'populationDensity');
    if (role === 'road' || role === 'city-hub' || role === 'city' || density !== undefined) {
      present = true;
    }
    if (role === 'road') {
      roads.push({ x: parcel.x, y: parcel.y });
    }
    if (role === 'city-hub' || role === 'city') {
      cities.push({ x: parcel.x, y: parcel.y });
    }
    if (density !== undefined && density >= MAP_POP_DENSE_ART_THRESHOLD) {
      popDense.push({ x: parcel.x, y: parcel.y });
    }
  }

  return { roads, cities, popDense, present };
}

function placeholderGeography(
  width: number,
  height: number,
): Pick<WorldGeography, 'roads' | 'cities' | 'popDense'> {
  const roads: CellRef[] = [];
  const cities: CellRef[] = [];
  const popDense: CellRef[] = [];

  for (const row of PLACEHOLDER_ROAD_ROWS) {
    const y = scaleAxis(row, REF_HEIGHT, height);
    for (let x = 0; x < width; x += 1) {
      if (x === 0 && y === 0) {
        continue;
      }
      roads.push({ x, y });
    }
  }
  for (const col of PLACEHOLDER_ROAD_COLS) {
    const x = scaleAxis(col, REF_WIDTH, width);
    for (let y = 0; y < height; y += 1) {
      if (x === 0 && y === 0) {
        continue;
      }
      roads.push({ x, y });
    }
  }

  for (const city of PLACEHOLDER_CITIES) {
    let x = scaleAxis(city.x, REF_WIDTH, width);
    const y = scaleAxis(city.y, REF_HEIGHT, height);
    if (x === 0 && y === 0) {
      x = Math.min(1, width - 1);
    }
    if (x === MARKET_HUB.x && y === MARKET_HUB.y) {
      continue;
    }
    cities.push({ x, y });
    for (let dy = -2; dy <= 2; dy += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        const distance = Math.abs(dx) + Math.abs(dy);
        if (distance === 0 || distance > 2) {
          continue;
        }
        popDense.push({ x: x + dx, y: y + dy });
      }
    }
  }

  return { roads, cities, popDense };
}

function paint(
  geo: Pick<WorldGeography, 'roads' | 'cities' | 'popDense'>,
  width: number,
  height: number,
): Map<string, CellFeatureArt> {
  const cells = new Map<string, CellFeatureArt>();
  for (const cell of geo.popDense) {
    mark(cells, cell.x, cell.y, width, height, { popDense: true });
  }
  for (const cell of geo.roads) {
    mark(cells, cell.x, cell.y, width, height, { road: true });
  }
  for (const cell of geo.cities) {
    mark(cells, cell.x, cell.y, width, height, {
      cityHub: true,
      cityBuilding: true,
      popDense: false,
    });
  }
  mark(cells, MARKET_HUB.x, MARKET_HUB.y, width, height, {
    marketHub: true,
    road: false,
    cityHub: false,
    cityBuilding: false,
    popDense: false,
  });
  return cells;
}

export function resolveMapFeatureArt(state: WorldState): MapFeatureArt {
  const { width, height } = state.map.size;
  const world = readWorldGeography(state.map);
  if (world.present) {
    return { source: 'world', cells: paint(world, width, height) };
  }
  return {
    source: 'placeholder',
    cells: paint(placeholderGeography(width, height), width, height),
  };
}

export function cellFeatureArt(
  art: MapFeatureArt,
  x: number,
  y: number,
): CellFeatureArt | undefined {
  return art.cells.get(cellKey(x, y));
}
