import type { ItemId } from '../production/items.js';

export type NpcDealSide = 'npc-sells' | 'npc-buys';

export interface NpcDeal {
  readonly id: string;
  readonly npcId: string;
  readonly side: NpcDealSide;
  readonly itemId: ItemId;
  readonly quantity: number;
  readonly unitPrice: number;
}

export interface NpcProfile {
  readonly id: string;
  readonly nameZh: string;
  readonly roleZh: string;
  readonly placeZh: string;
  readonly cityId: string | null;
}

export const NPCS: readonly NpcProfile[] = [
  { id: 'shen-bu', nameZh: '沈埠', roleZh: '收購', placeZh: '港區', cityId: null },
  { id: 'zhou-liao', nameZh: '周料', roleZh: '原料', placeZh: '臨港', cityId: 'lingang' },
  { id: 'jiang-bei', nameZh: '江北', roleZh: '掌櫃', placeZh: '西灣市', cityId: 'xiwan' },
  { id: 'lin-kou', nameZh: '林口', roleZh: '掌櫃', placeZh: '臨港市', cityId: 'lingang' },
  { id: 'he-zhan', nameZh: '何站', roleZh: '掌櫃', placeZh: '南站市', cityId: 'nanzhan' },
];

export function npcById(id: string): NpcProfile | undefined {
  return NPCS.find((npc) => npc.id === id);
}

export function npcAtCity(cityId: string): NpcProfile | undefined {
  return NPCS.find((npc) => npc.cityId === cityId && npc.roleZh === '掌櫃');
}
