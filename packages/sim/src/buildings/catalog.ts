/** 可建造的工廠類型（Sprint 2 表） */
export type FactoryTypeId = 'workshop' | 'assembly-plant';

export interface FactoryTypeDef {
  readonly id: FactoryTypeId;
  readonly nameZh: string;
  readonly nameEn: string;
  readonly footprint: { readonly width: number; readonly height: number };
  readonly buildCost: number;
  readonly buildTimeTicks: number;
  /** 完工後基礎物流效率係數（1.0 = 100%） */
  readonly baseLogisticsEfficiency: number;
  /** 每座相鄰（四方向）已完工工廠帶來的效率加成 */
  readonly adjacencyEfficiencyBonus: number;
}

export const FACTORY_TYPES: Record<FactoryTypeId, FactoryTypeDef> = {
  workshop: {
    id: 'workshop',
    nameZh: '小型工坊',
    nameEn: 'Workshop',
    footprint: { width: 1, height: 1 },
    buildCost: 3_000,
    buildTimeTicks: 3,
    baseLogisticsEfficiency: 1.0,
    adjacencyEfficiencyBonus: 0.08,
  },
  'assembly-plant': {
    id: 'assembly-plant',
    nameZh: '組裝廠',
    nameEn: 'Assembly Plant',
    footprint: { width: 1, height: 1 },
    buildCost: 7_200,
    buildTimeTicks: 5,
    baseLogisticsEfficiency: 1.12,
    adjacencyEfficiencyBonus: 0.06,
  },
};

export const FACTORY_TYPE_LIST: readonly FactoryTypeDef[] = Object.values(FACTORY_TYPES);
