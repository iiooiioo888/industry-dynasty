import type { CommodityId, LoanProductId, StockSymbol } from './types.js';

export interface LoanProductDef {
  readonly id: LoanProductId;
  readonly nameZh: string;
  readonly blurb: string;
  readonly rateBps: number;
  readonly termTicks: number;
}

export const LOAN_PRODUCTS: Record<LoanProductId, LoanProductDef> = {
  'working-capital': {
    id: 'working-capital',
    nameZh: '週轉貸款',
    blurb: '補短期現金。期限短、利率最高，不適合借來閒置。',
    rateBps: 280,
    termTicks: 4,
  },
  construction: {
    id: 'construction',
    nameZh: '建設融資',
    blurb: '撥入閒置現金，可直接用於買地與建造。仍高於存款利率。',
    rateBps: 220,
    termTicks: 8,
  },
};

export const LOAN_PRODUCT_LIST: readonly LoanProductDef[] = [
  LOAN_PRODUCTS['working-capital'],
  LOAN_PRODUCTS.construction,
];

export interface StockDef {
  readonly symbol: StockSymbol;
  readonly nameZh: string;
  readonly blurb: string;
  readonly basePrice: number;
  /** 相對基準價的基點偏移，依銀行週期循環。 */
  readonly waveBps: readonly number[];
}

export const STOCKS: Record<StockSymbol, StockDef> = {
  IRON: {
    symbol: 'IRON',
    nameZh: '鑄鐵材料',
    blurb: '波段較大，適合對照建設週期進出。',
    basePrice: 80,
    waveBps: [-1500, -800, -200, 400, 1200, 1800, 700, -400],
  },
  PORT: {
    symbol: 'PORT',
    nameZh: '港埠物流',
    blurb: '波動中等，和大宗走勢不必同向。',
    basePrice: 120,
    waveBps: [-800, -400, 0, 300, 700, 1000, 400, -200],
  },
  GRID: {
    symbol: 'GRID',
    nameZh: '城市電力',
    blurb: '波幅小，換來的是較低的價差空間。',
    basePrice: 60,
    waveBps: [-400, -200, 0, 200, 400, 300, 100, -100],
  },
  TOOL: {
    symbol: 'TOOL',
    nameZh: '精密機具',
    blurb: '波幅最大。持有跨期會放棄閒置利息。',
    basePrice: 150,
    waveBps: [-2000, -1000, 0, 800, 2000, 1400, 400, -1200],
  },
};

export const STOCK_LIST: readonly StockDef[] = [STOCKS.IRON, STOCKS.PORT, STOCKS.GRID, STOCKS.TOOL];

export interface CommodityDef {
  readonly id: CommodityId;
  readonly nameZh: string;
  readonly unit: string;
  readonly lotSize: number;
  readonly basePrice: number;
  readonly waveBps: readonly number[];
}

export const COMMODITIES: Record<CommodityId, CommodityDef> = {
  copper: {
    id: 'copper',
    nameZh: '銅錠',
    unit: '噸',
    lotSize: 10,
    basePrice: 42,
    waveBps: [-600, -200, 200, 800, 400, -300],
  },
  coal: {
    id: 'coal',
    nameZh: '煤炭',
    unit: '噸',
    lotSize: 20,
    basePrice: 15,
    waveBps: [-400, 0, 300, 600, 200, -200],
  },
  yarn: {
    id: 'yarn',
    nameZh: '棉紗',
    unit: '捆',
    lotSize: 10,
    basePrice: 28,
    waveBps: [-500, -100, 400, 900, 300, -200],
  },
  steel: {
    id: 'steel',
    nameZh: '鋼材',
    unit: '噸',
    lotSize: 10,
    basePrice: 64,
    waveBps: [-700, -300, 100, 600, 1000, 200],
  },
};

export const COMMODITY_LIST: readonly CommodityDef[] = [
  COMMODITIES.copper,
  COMMODITIES.coal,
  COMMODITIES.yarn,
  COMMODITIES.steel,
];
