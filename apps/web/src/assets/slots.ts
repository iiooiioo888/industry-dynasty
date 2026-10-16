import type { FactoryTypeId, ItemId, ParcelResourceKind } from '@industry-dynasty/sim';

/**
 * 美術槽位。路徑對應 `apps/web/public/assets/` 的檔名。
 *
 * `npcMerchant` 是 Sprint 4 銷售面板既有槽位，仍指向 `npc-merchant.png`
 * （該圖未在這 14 張資源內；面板載入失敗時改顯示文字）。
 */
export const ASSET_SLOTS = {
  npcMerchant: '/assets/npc-merchant.png',
  resources: {
    'iron-vein': '/assets/res-iron-vein.png',
    'resin-bog': '/assets/res-resin-bog.png',
    'quartz-sand': '/assets/res-quartz-sand.png',
    'coal-seam': '/assets/res-coal-seam.png',
    'copper-shale': '/assets/res-copper-shale.png',
  },
  items: {
    'raw-ore': '/assets/item-raw-ore.png',
    resin: '/assets/item-resin.png',
    'basic-part': '/assets/item-basic-part.png',
    'alloy-plate': '/assets/item-alloy-plate.png',
  },
  buildings: {
    workshop: '/assets/bld-workshop.png',
    'assembly-plant': '/assets/bld-assembly-plant.png',
  },
  ui: {
    auctionBanner: '/assets/ui-auction-banner.png',
    panelHeader: '/assets/ui-panel-header.png',
    appLogo: '/assets/ui-app-logo.png',
  },
} as const satisfies {
  npcMerchant: string;
  resources: Record<ParcelResourceKind, string>;
  items: Record<ItemId, string>;
  buildings: Record<FactoryTypeId, string>;
  ui: {
    auctionBanner: string;
    panelHeader: string;
    appLogo: string;
  };
};
