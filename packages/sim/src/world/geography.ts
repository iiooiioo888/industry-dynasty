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

export function roadAxisAt(parcels: readonly Parcel[], parcel: Parcel): RoadAxis | null {
  if (parcel.role !== 'road') {
    return null;
  }
  const linked = (x: number, y: number) => {
    const neighbor = parcels.find((p) => p.x === x && p.y === y);
    return neighbor?.role === 'road' || neighbor?.role === 'city-hub';
  };
  const horizontal = linked(parcel.x - 1, parcel.y) || linked(parcel.x + 1, parcel.y);
  const vertical = linked(parcel.x, parcel.y - 1) || linked(parcel.x, parcel.y + 1);
  if (horizontal && vertical) {
    return 'cross';
  }
  if (vertical) {
    return 'v';
  }
  return 'h';
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
