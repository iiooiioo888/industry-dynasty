export type MarketEventKind = 'quiet' | 'port-delay' | 'festival' | 'ore-squeeze';

export interface MarketEvent {
  readonly kind: MarketEventKind;
  readonly titleZh: string;
  readonly detailZh: string;
  readonly extraShipTicks: number;
  readonly retailMultiplier: number;
  readonly orePriceMultiplier: number;
}

const QUIET: MarketEvent = {
  kind: 'quiet',
  titleZh: '平靜的一天',
  detailZh: '港區與城市需求照常。',
  extraShipTicks: 0,
  retailMultiplier: 1,
  orePriceMultiplier: 1,
};

/** 同一天永遠同一條。港區原礦只會上調，不會把既有通關路徑壓成虧損。 */
export function eventForDay(gameDay: number): MarketEvent {
  const slot = ((gameDay % 7) + 7) % 7;
  if (slot === 3) {
    return {
      kind: 'port-delay',
      titleZh: '港務排隊',
      detailZh: '今日出貨多走 2 刻才入帳。',
      extraShipTicks: 2,
      retailMultiplier: 1,
      orePriceMultiplier: 1,
    };
  }
  if (slot === 5) {
    return {
      kind: 'festival',
      titleZh: '城區趕集',
      detailZh: '門市今日多消化三成五。',
      extraShipTicks: 0,
      retailMultiplier: 1.35,
      orePriceMultiplier: 1,
    };
  }
  if (slot === 6) {
    return {
      kind: 'ore-squeeze',
      titleZh: '原料緊俏',
      detailZh: '港區原礦收購價上調 8%。',
      extraShipTicks: 0,
      retailMultiplier: 1,
      orePriceMultiplier: 1.08,
    };
  }
  return QUIET;
}
