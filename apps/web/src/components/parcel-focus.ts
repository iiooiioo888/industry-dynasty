export type CompassPoint = '北' | '東北' | '東' | '東南' | '南' | '西南' | '西' | '西北' | '原點';

const COMPASS_POINTS: readonly CompassPoint[] = [
  '北',
  '東北',
  '東',
  '東南',
  '南',
  '西南',
  '西',
  '西北',
];

/** 以 x 向東、y 向南為正，回傳八方位。與參考點幾乎重疊時為原點。 */
export function compassPoint(dx: number, dy: number): CompassPoint {
  if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
    return '原點';
  }
  const degrees = (Math.atan2(dx, -dy) * 180) / Math.PI;
  const index = Math.round(((degrees + 360) % 360) / 45) % 8;
  return COMPASS_POINTS[index] ?? '北';
}

export function manhattan(ax: number, ay: number, bx: number, by: number): number {
  return Math.abs(ax - bx) + Math.abs(ay - by);
}

export function accessLabel(roadAccess: number): string {
  if (roadAccess >= 0.95) {
    return '沿路';
  }
  if (roadAccess >= 0.7) {
    return '鄰路';
  }
  if (roadAccess >= 0.4) {
    return '近路';
  }
  return '偏遠';
}

export function relationPhrase(origin: string, dx: number, dy: number, distance: number): string {
  const point = compassPoint(dx, dy);
  if (point === '原點') {
    return `就在${origin}`;
  }
  return `在${origin}${point}方 ${Math.round(distance)} 格`;
}
