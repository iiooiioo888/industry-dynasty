/** 可建造的據點。廠房生產；門市與研發室不跑配方。 */
export type FactoryTypeId = 'workshop' | 'assembly-plant' | 'storefront' | 'lab';

export type BuildingRole = 'production' | 'retail' | 'research';

/** 廠房地圖用。`works` 才能排產。 */
export type SiteKind = 'works' | 'lab' | 'store';

export interface FactoryTypeDef {
  readonly id: FactoryTypeId;
  readonly nameZh: string;
  readonly nameEn: string;
  readonly role: BuildingRole;
  readonly kind: SiteKind;
  readonly footprint: { readonly width: number; readonly height: number };
  readonly buildCost: number;
  readonly buildTimeTicks: number;
  /** 完工後基礎物流效率係數（1.0 = 100%） */
  readonly baseLogisticsEfficiency: number;
  /** 每座相鄰（四方向）已完工廠房帶來的效率加成 */
  readonly adjacencyEfficiencyBonus: number;
  /** 非廠房的每日維持費。廠房仍走全域維護常數，這裡為 0。 */
  readonly dailyUpkeep: number;
}

/** 門市只蓋在人口夠密的自有地，避免空城也能開店。 */
export const STOREFRONT_MIN_DENSITY = 55;

export const FACTORY_TYPES: Record<FactoryTypeId, FactoryTypeDef> = {
  workshop: {
    id: 'workshop',
    nameZh: '小型工坊',
    nameEn: 'Workshop',
    role: 'production',
    kind: 'works',
    footprint: { width: 1, height: 1 },
    buildCost: 3_000,
    buildTimeTicks: 3,
    baseLogisticsEfficiency: 1.0,
    adjacencyEfficiencyBonus: 0.08,
    dailyUpkeep: 0,
  },
  'assembly-plant': {
    id: 'assembly-plant',
    nameZh: '組裝廠',
    nameEn: 'Assembly Plant',
    role: 'production',
    kind: 'works',
    footprint: { width: 1, height: 1 },
    buildCost: 7_200,
    buildTimeTicks: 5,
    baseLogisticsEfficiency: 1.12,
    adjacencyEfficiencyBonus: 0.06,
    dailyUpkeep: 0,
  },
  storefront: {
    id: 'storefront',
    nameZh: '門市',
    nameEn: 'Storefront',
    role: 'retail',
    kind: 'store',
    footprint: { width: 1, height: 1 },
    buildCost: 4_500,
    buildTimeTicks: 3,
    baseLogisticsEfficiency: 1,
    adjacencyEfficiencyBonus: 0,
    dailyUpkeep: 25,
  },
  lab: {
    id: 'lab',
    nameZh: '研發室',
    nameEn: 'Research Lab',
    role: 'research',
    kind: 'lab',
    footprint: { width: 1, height: 1 },
    buildCost: 6_000,
    buildTimeTicks: 4,
    baseLogisticsEfficiency: 1,
    adjacencyEfficiencyBonus: 0,
    dailyUpkeep: 30,
  },
};

export function isProductiveFactory(factoryTypeId: FactoryTypeId): boolean {
  return FACTORY_TYPES[factoryTypeId].role === 'production';
}

export const FACTORY_TYPE_LIST: readonly FactoryTypeDef[] = Object.values(FACTORY_TYPES);
