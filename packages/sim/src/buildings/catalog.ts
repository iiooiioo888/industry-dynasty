/** 可建造的建物。工坊與組裝廠會排產；研發室與門市不會。 */
export type FactoryTypeId = 'workshop' | 'assembly-plant' | 'lab' | 'storefront';

/** `works` 才算相鄰工廠，也才能排產線。 */
export type SiteKind = 'works' | 'lab' | 'store';

export interface FactoryTypeDef {
  readonly id: FactoryTypeId;
  readonly nameZh: string;
  readonly nameEn: string;
  readonly kind: SiteKind;
  readonly footprint: { readonly width: number; readonly height: number };
  readonly buildCost: number;
  readonly buildTimeTicks: number;
  /** 完工後基礎物流效率係數（1.0 = 100%） */
  readonly baseLogisticsEfficiency: number;
  /** 每座相鄰（四方向）已完工工廠帶來的效率加成 */
  readonly adjacencyEfficiencyBonus: number;
  readonly blurb: string;
}

/** 門市只蓋在人口夠密的自有地，避免空城也能開店。 */
export const STOREFRONT_MIN_DENSITY = 55;

export const FACTORY_TYPES: Record<FactoryTypeId, FactoryTypeDef> = {
  workshop: {
    id: 'workshop',
    nameZh: '小型工坊',
    nameEn: 'Workshop',
    kind: 'works',
    footprint: { width: 1, height: 1 },
    buildCost: 3_000,
    buildTimeTicks: 3,
    baseLogisticsEfficiency: 1.0,
    adjacencyEfficiencyBonus: 0.08,
    blurb: '開採與一階加工。',
  },
  'assembly-plant': {
    id: 'assembly-plant',
    nameZh: '組裝廠',
    nameEn: 'Assembly Plant',
    kind: 'works',
    footprint: { width: 1, height: 1 },
    buildCost: 7_200,
    buildTimeTicks: 5,
    baseLogisticsEfficiency: 1.12,
    adjacencyEfficiencyBonus: 0.06,
    blurb: '成品與城市消費品。',
  },
  lab: {
    id: 'lab',
    nameZh: '研發室',
    nameEn: 'Lab',
    kind: 'lab',
    footprint: { width: 1, height: 1 },
    buildCost: 4_800,
    buildTimeTicks: 4,
    baseLogisticsEfficiency: 1,
    adjacencyEfficiencyBonus: 0,
    blurb: '不排產。指派研發員後，每刻累積研發點。',
  },
  storefront: {
    id: 'storefront',
    nameZh: '城市門市',
    nameEn: 'Storefront',
    kind: 'store',
    footprint: { width: 1, height: 1 },
    buildCost: 5_600,
    buildTimeTicks: 3,
    baseLogisticsEfficiency: 1,
    adjacencyEfficiencyBonus: 0,
    blurb: `不排產。人口密度至少 ${STOREFRONT_MIN_DENSITY} 才能蓋，日結按定價賣給當地。`,
  },
};

export function isProductiveFactory(factoryTypeId: FactoryTypeId): boolean {
  return FACTORY_TYPES[factoryTypeId].kind === 'works';
}

export const FACTORY_TYPE_LIST: readonly FactoryTypeDef[] = Object.values(FACTORY_TYPES);
