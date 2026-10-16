import type { ItemId } from '../production/items.js';

export type ParcelResourceKind =
  'iron-vein' | 'resin-bog' | 'quartz-sand' | 'coal-seam' | 'copper-shale';

export interface ParcelResourceDef {
  readonly kind: ParcelResourceKind;
  readonly nameZh: string;
  readonly linkedItemId: ItemId;
  readonly colorHue: number;
}

export const PARCEL_RESOURCE_DEFS: Record<ParcelResourceKind, ParcelResourceDef> = {
  'iron-vein': { kind: 'iron-vein', nameZh: '鐵脈', linkedItemId: 'raw-ore', colorHue: 12 },
  'resin-bog': { kind: 'resin-bog', nameZh: '樹脂沼', linkedItemId: 'resin', colorHue: 95 },
  'quartz-sand': {
    kind: 'quartz-sand',
    nameZh: '石英砂',
    linkedItemId: 'quartz-grit',
    colorHue: 200,
  },
  'coal-seam': { kind: 'coal-seam', nameZh: '煤層', linkedItemId: 'coal', colorHue: 240 },
  'copper-shale': {
    kind: 'copper-shale',
    nameZh: '銅頁岩',
    linkedItemId: 'copper-ore',
    colorHue: 28,
  },
};

const KINDS = Object.keys(PARCEL_RESOURCE_DEFS) as ParcelResourceKind[];

/** 每塊地皮獨有的資源儲量與品質（位置決定種類與數量） */
export interface ParcelResource {
  readonly kind: ParcelResourceKind;
  readonly nameZh: string;
  readonly linkedItemId: ItemId;
  readonly richness: number;
  readonly reserves: number;
  readonly initialReserves: number;
}

function hashCoords(x: number, y: number): number {
  return (x * 73856093) ^ (y * 19349663) ^ (x << 8) ^ (y << 4);
}

export function generateParcelResource(x: number, y: number): ParcelResource {
  const h = Math.abs(hashCoords(x, y));
  const kind = KINDS[h % KINDS.length];
  const def = PARCEL_RESOURCE_DEFS[kind];
  const richness = 1 + (h % 5);
  const reserves = 60 + (h % 140) + richness * 8;
  return {
    kind: def.kind,
    nameZh: def.nameZh,
    linkedItemId: def.linkedItemId,
    richness,
    reserves,
    initialReserves: reserves,
  };
}

export function resourceThroughputBonus(
  resource: ParcelResource,
  recipeUsesLinkedItem: boolean,
): number {
  if (!recipeUsesLinkedItem) {
    return 1;
  }
  return 1 + resource.richness * 0.06;
}

export function recipeUsesLinkedResource(
  resource: ParcelResource,
  inputItemIds: readonly string[],
): boolean {
  return inputItemIds.includes(resource.linkedItemId);
}
