import type { CityHub } from '../types/map.js';

export interface RivalFirm {
  readonly id: string;
  readonly nameZh: string;
  readonly focusZh: string;
  readonly shareByCity: Readonly<Record<string, number>>;
}

export interface RivalBook {
  readonly firms: readonly RivalFirm[];
}

export function createRivalBook(cities: readonly Pick<CityHub, 'id'>[]): RivalBook {
  const ore: Record<string, number> = {};
  const processed: Record<string, number> = {};
  for (const city of cities) {
    ore[city.id] = 0.12;
    processed[city.id] = 0.16;
  }
  return {
    firms: [
      { id: 'rival-ore', nameZh: '西灣礦業', focusZh: '原礦批發', shareByCity: ore },
      { id: 'rival-mill', nameZh: '臨港加工', focusZh: '加工品', shareByCity: processed },
    ],
  };
}

export function readRivals(book: RivalBook | undefined, cities: readonly Pick<CityHub, 'id'>[]): RivalBook {
  return book ?? createRivalBook(cities);
}

/** 只擠門市配額，不改港區收購單。 */
export function rivalShareForCity(book: RivalBook, cityId: string | null): number {
  if (!cityId) {
    return 0;
  }
  const sum = book.firms.reduce((total, firm) => total + (firm.shareByCity[cityId] ?? 0), 0);
  return Math.min(0.55, sum);
}

export function advanceRivals(book: RivalBook, gameDay: number): RivalBook {
  return {
    firms: book.firms.map((firm) => {
      const delta =
        firm.id === 'rival-ore'
          ? gameDay % 2 === 0
            ? 0.01
            : -0.005
          : gameDay % 3 === 0
            ? 0.008
            : -0.004;
      const shareByCity: Record<string, number> = {};
      for (const [cityId, share] of Object.entries(firm.shareByCity)) {
        shareByCity[cityId] = clamp(share + delta, 0.05, 0.32);
      }
      return { ...firm, shareByCity };
    }),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
