import {
  parcelIdFromCoords,
  type CityHub,
  type GameMap,
  type Parcel,
  type ParcelRole,
  type PopulationZone,
  type RoadLine,
} from '../types/map.js';
import { generateParcelResource } from './parcel-resources.js';

/** 城市人口影響半徑（曼哈頓距離）。超出後城市臨近度為 0。 */
export const CITY_INFLUENCE_RADIUS = 6;

const RURAL_DENSITY_FLOOR = 8;

export interface MapGeography {
  readonly parcels: readonly Parcel[];
  readonly cities: readonly CityHub[];
  readonly denseZones: readonly PopulationZone[];
  readonly roads: readonly RoadLine[];
}

export function buildGeography(width: number, height: number): MapGeography {
  const layout =
    width >= 12 && height >= 10 ? authoredLayout(width, height) : compactLayout(width, height);
  return paintGeography(width, height, layout.cities, layout.roads, layout.denseZones);
}

export function isPurchasableRole(role: ParcelRole): boolean {
  return role === 'land';
}

export function denseZoneAt(
  map: Pick<GameMap, 'denseZones'>,
  x: number,
  y: number,
): PopulationZone | undefined {
  return map.denseZones.find(
    (zone) => x >= zone.x && x < zone.x + zone.width && y >= zone.y && y < zone.y + zone.height,
  );
}

export function roadNamesAt(map: Pick<GameMap, 'roads'>, x: number, y: number): readonly string[] {
  return map.roads.filter((road) => cellOnRoad(road, x, y)).map((road) => road.name);
}

export type RoadAxis = 'h' | 'v' | 'cross';

/** 道路格的四向。y 向下增大，`n` 是上一列。 */
export const ROAD_DIRS = ['n', 'e', 's', 'w'] as const;
export type RoadDir = (typeof ROAD_DIRS)[number];

export interface RoadLinks {
  readonly n: boolean;
  readonly e: boolean;
  readonly s: boolean;
  readonly w: boolean;
}

/** 路口形態。`end` 只連一個方向；地圖外的那一側仍用整張直線圖接到邊界。 */
export type RoadJoint = 'straight' | 'end' | 'corner' | 'tee' | 'cross';

/**
 * 單張直線道路圖怎麼貼。
 * `tile`：整格旋轉（東西 0°、南北 90°）。
 * `arms`：只畫連出去的方向，轉角／T／十字用同一張圖的路帶拼接。
 */
export interface RoadPresentation {
  readonly joint: RoadJoint;
  readonly mode: 'tile' | 'arms';
  readonly rotation: 0 | 90;
  readonly links: RoadLinks;
  /** 要畫出來的臂。邊界路頭會多畫朝地圖外的一臂，直線才接到邊。 */
  readonly arms: readonly RoadDir[];
}

const OPPOSITE_DIR: Record<RoadDir, RoadDir> = {
  n: 's',
  s: 'n',
  e: 'w',
  w: 'e',
};

/**
 * 粗略軸向。只要同時有橫向與縱向連接就回傳 `cross`（含轉角與 T 字）。
 * 貼圖請用 `roadPresentationAt`。
 */
export function roadAxisAt(parcels: readonly Parcel[], parcel: Parcel): RoadAxis | null {
  const links = roadLinksAt(parcels, parcel);
  if (!links) {
    return null;
  }
  const horizontal = links.e || links.w;
  const vertical = links.n || links.s;
  if (horizontal && vertical) {
    return 'cross';
  }
  if (vertical) {
    return 'v';
  }
  return 'h';
}

/** 與相鄰道路或城市核心相連的方向。非道路格回傳 null。 */
export function roadLinksAt(parcels: readonly Parcel[], parcel: Parcel): RoadLinks | null {
  if (parcel.role !== 'road') {
    return null;
  }
  const linked = (x: number, y: number) => {
    const neighbor = parcels.find((p) => p.x === x && p.y === y);
    return neighbor?.role === 'road' || neighbor?.role === 'city-hub';
  };
  return {
    n: linked(parcel.x, parcel.y - 1),
    e: linked(parcel.x + 1, parcel.y),
    s: linked(parcel.x, parcel.y + 1),
    w: linked(parcel.x - 1, parcel.y),
  };
}

export function roadPresentationAt(
  parcels: readonly Parcel[],
  parcel: Parcel,
  size: { readonly width: number; readonly height: number },
): RoadPresentation | null {
  const links = roadLinksAt(parcels, parcel);
  if (!links) {
    return null;
  }
  const joint = roadJointOf(links);
  const linkedArms = armsOf(links);
  if (joint === 'straight') {
    return axisTile(links, linkedArms.includes('n') || linkedArms.includes('s'));
  }
  if (joint === 'corner' || joint === 'tee' || joint === 'cross') {
    return { joint, mode: 'arms', rotation: 0, links, arms: linkedArms };
  }
  const dir = linkedArms[0];
  if (!dir || isOffMap(OPPOSITE_DIR[dir], parcel.x, parcel.y, size.width, size.height)) {
    return axisTile(links, dir === 'n' || dir === 's', 'end');
  }
  return { joint: 'end', mode: 'arms', rotation: 0, links, arms: linkedArms };
}

function roadJointOf(links: RoadLinks): RoadJoint {
  const count = ROAD_DIRS.reduce((sum, dir) => sum + (links[dir] ? 1 : 0), 0);
  if (count >= 4) {
    return 'cross';
  }
  if (count === 3) {
    return 'tee';
  }
  if (count === 2) {
    return (links.n && links.s) || (links.e && links.w) ? 'straight' : 'corner';
  }
  if (count === 1) {
    return 'end';
  }
  return 'straight';
}

function axisTile(
  links: RoadLinks,
  vertical: boolean,
  joint: RoadJoint = 'straight',
): RoadPresentation {
  return {
    joint,
    mode: 'tile',
    rotation: vertical ? 90 : 0,
    links,
    arms: vertical ? ['n', 's'] : ['e', 'w'],
  };
}

function armsOf(links: RoadLinks): RoadDir[] {
  return ROAD_DIRS.filter((dir) => links[dir]);
}

function isOffMap(dir: RoadDir, x: number, y: number, width: number, height: number): boolean {
  switch (dir) {
    case 'n':
      return y <= 0;
    case 's':
      return y >= height - 1;
    case 'w':
      return x <= 0;
    case 'e':
      return x >= width - 1;
  }
}

function authoredLayout(
  width: number,
  height: number,
): {
  cities: CityHub[];
  roads: RoadLine[];
  denseZones: PopulationZone[];
} {
  const cities = [
    clampCity({ id: 'xiwan', name: '西灣市', x: 2, y: 2, width: 2, height: 2 }, width, height),
    clampCity({ id: 'lingang', name: '臨港市', x: 12, y: 2, width: 2, height: 2 }, width, height),
    clampCity({ id: 'nanzhan', name: '南站市', x: 7, y: 8, width: 2, height: 2 }, width, height),
  ];
  const roads = [
    clampRoad(
      { id: 'harbor', name: '港灣大道', axis: 'h', fixed: 3, from: 0, to: width - 1 },
      width,
      height,
    ),
    clampRoad(
      { id: 'south', name: '南幹道', axis: 'h', fixed: 8, from: 2, to: width - 1 },
      width,
      height,
    ),
    clampRoad(
      { id: 'west-spur', name: '西支線', axis: 'v', fixed: 2, from: 3, to: 8 },
      width,
      height,
    ),
    clampRoad(
      { id: 'east-spur', name: '東支線', axis: 'v', fixed: 13, from: 3, to: 8 },
      width,
      height,
    ),
  ].filter((road): road is RoadLine => road !== null);
  const denseZones = [
    clampZone(
      { id: 'xiwan-res', name: '西灣密居', x: 4, y: 4, width: 3, height: 2, density: 88 },
      width,
      height,
    ),
    clampZone(
      { id: 'lingang-res', name: '臨港密居', x: 10, y: 4, width: 2, height: 3, density: 92 },
      width,
      height,
    ),
    clampZone(
      { id: 'nanzhan-res', name: '南站外圍', x: 4, y: 9, width: 3, height: 2, density: 76 },
      width,
      height,
    ),
  ].filter((zone): zone is PopulationZone => zone !== null);
  return { cities, roads, denseZones };
}

function compactLayout(
  width: number,
  height: number,
): {
  cities: CityHub[];
  roads: RoadLine[];
  denseZones: PopulationZone[];
} {
  const cityX = Math.max(0, width - 2);
  const cityY = Math.min(1, height - 1);
  const cities: CityHub[] = [
    { id: 'town-1', name: '市集', x: cityX, y: cityY, width: 1, height: 1 },
  ];
  const roadY = Math.min(1, height - 1);
  const roads: RoadLine[] = [
    { id: 'road-main', name: '市集路', axis: 'h', fixed: roadY, from: 0, to: width - 1 },
  ];
  const denseZones: PopulationZone[] = [];
  if (height >= 3 && width >= 2) {
    denseZones.push({
      id: 'dense-1',
      name: '市集外圍',
      x: 0,
      y: Math.min(2, height - 1),
      width: Math.min(2, width),
      height: 1,
      density: 72,
    });
  }
  return { cities, roads, denseZones };
}

function paintGeography(
  width: number,
  height: number,
  cities: readonly CityHub[],
  roads: readonly RoadLine[],
  denseZones: readonly PopulationZone[],
): MapGeography {
  const roles = new Map<string, ParcelRole>();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      roles.set(key(x, y), 'land');
    }
  }
  for (const road of roads) {
    for (const cell of roadCells(road)) {
      if (!inBounds(cell.x, cell.y, width, height)) {
        continue;
      }
      if (roles.get(key(cell.x, cell.y)) !== 'city-hub') {
        roles.set(key(cell.x, cell.y), 'road');
      }
    }
  }
  for (const city of cities) {
    for (let y = city.y; y < city.y + city.height; y++) {
      for (let x = city.x; x < city.x + city.width; x++) {
        if (inBounds(x, y, width, height)) {
          roles.set(key(x, y), 'city-hub');
        }
      }
    }
  }

  const connected = new Set<string>();
  for (const [cellKey, role] of roles) {
    if (role === 'road' || role === 'city-hub') {
      connected.add(cellKey);
    }
  }

  const parcels: Parcel[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const role = roles.get(key(x, y)) ?? 'land';
      const nearest = nearestCity(x, y, cities);
      const cityProximity =
        nearest.distance === Infinity ? 0 : clamp01(1 - nearest.distance / CITY_INFLUENCE_RADIUS);
      let density =
        nearest.distance === Infinity
          ? RURAL_DENSITY_FLOOR
          : densityFromCityDistance(nearest.distance);
      const zone = denseZones.find(
        (z) => x >= z.x && x < z.x + z.width && y >= z.y && y < z.y + z.height,
      );
      if (zone && role !== 'city-hub') {
        density = Math.max(density, zone.density);
      }
      if (role === 'city-hub') {
        density = 100;
      } else if (role === 'road') {
        density = Math.min(100, density + 6);
      } else if (adjacentToConnected(x, y, connected)) {
        density = Math.min(100, density + 3);
      }
      parcels.push({
        id: parcelIdFromCoords(x, y),
        x,
        y,
        state: 'empty',
        ownerId: null,
        resource: generateParcelResource(x, y),
        role,
        populationDensity: density,
        roadAccess: roadAccessAt(x, y, role, connected),
        cityProximity,
        nearestCityName: nearest.name,
        nearestCityDistance: nearest.distance === Infinity ? 0 : nearest.distance,
      });
    }
  }

  return { parcels, cities, denseZones, roads };
}

function densityFromCityDistance(distance: number): number {
  if (distance <= 0) {
    return 100;
  }
  const influence = Math.max(0, 1 - distance / CITY_INFLUENCE_RADIUS);
  const fromCity = Math.round(100 * Math.pow(influence, 1.35));
  return Math.max(RURAL_DENSITY_FLOOR, fromCity);
}

function nearestCity(
  x: number,
  y: number,
  cities: readonly CityHub[],
): { distance: number; name: string | null } {
  let distance = Infinity;
  let name: string | null = null;
  for (const city of cities) {
    for (let cy = city.y; cy < city.y + city.height; cy++) {
      for (let cx = city.x; cx < city.x + city.width; cx++) {
        const dist = Math.abs(cx - x) + Math.abs(cy - y);
        if (dist < distance) {
          distance = dist;
          name = city.name;
        }
      }
    }
  }
  return { distance, name };
}

function roadAccessAt(
  x: number,
  y: number,
  role: ParcelRole,
  connected: ReadonlySet<string>,
): number {
  if (role === 'road' || role === 'city-hub') {
    return 1;
  }
  let best = 0.12;
  for (let dy = -2; dy <= 2; dy++) {
    for (let dx = -2; dx <= 2; dx++) {
      const dist = Math.abs(dx) + Math.abs(dy);
      if (dist === 0 || dist > 2) {
        continue;
      }
      if (!connected.has(key(x + dx, y + dy))) {
        continue;
      }
      const score = dist === 1 ? 0.78 : 0.42;
      if (score > best) {
        best = score;
      }
    }
  }
  return best;
}

function adjacentToConnected(x: number, y: number, connected: ReadonlySet<string>): boolean {
  return (
    connected.has(key(x + 1, y)) ||
    connected.has(key(x - 1, y)) ||
    connected.has(key(x, y + 1)) ||
    connected.has(key(x, y - 1))
  );
}

function roadCells(road: RoadLine): { x: number; y: number }[] {
  const cells: { x: number; y: number }[] = [];
  const from = Math.min(road.from, road.to);
  const to = Math.max(road.from, road.to);
  if (road.axis === 'h') {
    for (let x = from; x <= to; x++) {
      cells.push({ x, y: road.fixed });
    }
  } else {
    for (let y = from; y <= to; y++) {
      cells.push({ x: road.fixed, y });
    }
  }
  return cells;
}

function cellOnRoad(road: RoadLine, x: number, y: number): boolean {
  const from = Math.min(road.from, road.to);
  const to = Math.max(road.from, road.to);
  if (road.axis === 'h') {
    return y === road.fixed && x >= from && x <= to;
  }
  return x === road.fixed && y >= from && y <= to;
}

function clampCity(city: CityHub, width: number, height: number): CityHub {
  const w = Math.max(1, Math.min(city.width, width));
  const h = Math.max(1, Math.min(city.height, height));
  return {
    ...city,
    width: w,
    height: h,
    x: clampInt(city.x, 0, width - w),
    y: clampInt(city.y, 0, height - h),
  };
}

function clampRoad(road: RoadLine, width: number, height: number): RoadLine | null {
  if (width <= 0 || height <= 0) {
    return null;
  }
  if (road.axis === 'h') {
    const y = clampInt(road.fixed, 0, height - 1);
    const from = clampInt(Math.min(road.from, road.to), 0, width - 1);
    const to = clampInt(Math.max(road.from, road.to), 0, width - 1);
    return { ...road, fixed: y, from, to };
  }
  const x = clampInt(road.fixed, 0, width - 1);
  const from = clampInt(Math.min(road.from, road.to), 0, height - 1);
  const to = clampInt(Math.max(road.from, road.to), 0, height - 1);
  return { ...road, fixed: x, from, to };
}

function clampZone(zone: PopulationZone, width: number, height: number): PopulationZone | null {
  if (width <= 0 || height <= 0) {
    return null;
  }
  const w = Math.max(1, Math.min(zone.width, width));
  const h = Math.max(1, Math.min(zone.height, height));
  const x = clampInt(zone.x, 0, width - w);
  const y = clampInt(zone.y, 0, height - h);
  if (x + w > width || y + h > height) {
    return null;
  }
  return { ...zone, x, y, width: w, height: h, density: clampInt(zone.density, 0, 100) };
}

function inBounds(x: number, y: number, width: number, height: number): boolean {
  return x >= 0 && y >= 0 && x < width && y < height;
}

function key(x: number, y: number): string {
  return `${x},${y}`;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}
