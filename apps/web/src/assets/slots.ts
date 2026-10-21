import type { FactoryTypeId, ItemId, ParcelResourceKind } from '@industry-dynasty/sim';

/**
 * 美術槽位。路徑對應 `apps/web/public/assets/` 的檔名。
 *
 * `npcMerchant` 是 Sprint 4 銷售面板既有槽位，仍指向 `npc-merchant.png`
 * （該圖未在這 14 張資源內；面板載入失敗時改顯示文字）。
 *
 * `map` 與 `ui.marketHub` 是道路、城市、人口密集與港區市場的固定鍵。
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
    coal: '/assets/res-coal-seam.png',
    'copper-ore': '/assets/res-copper-shale.png',
    'quartz-grit': '/assets/res-quartz-sand.png',
    'iron-ingot': '/assets/item-raw-ore.png',
    'copper-ingot': '/assets/item-alloy-plate.png',
    silica: '/assets/res-quartz-sand.png',
    'basic-part': '/assets/item-basic-part.png',
    'alloy-plate': '/assets/item-alloy-plate.png',
    'hand-tool': '/assets/item-basic-part.png',
    'wire-bundle': '/assets/item-alloy-plate.png',
    'pack-module': '/assets/item-alloy-plate.png',
    'precision-module': '/assets/item-alloy-plate.png',
    'control-unit': '/assets/item-alloy-plate.png',
    'tool-kit': '/assets/item-basic-part.png',
    'wire-spool': '/assets/item-alloy-plate.png',
    'sealant-coat': '/assets/item-resin.png',
  },
  buildings: {
    workshop: '/assets/bld-workshop.png',
    'assembly-plant': '/assets/bld-assembly-plant.png',
    storefront: '/assets/ui-market-hub.png',
    lab: '/assets/bld-assembly-plant.png',
  },
  /**
   * 世界地圖圖層。鍵名與檔名固定，供可玩性地理（道路／城市／人口）接上。
   * 解析見 `src/map/map-feature-art.ts`。
   */
  map: {
    road: '/assets/map-road.png',
    cityHub: '/assets/map-city-hub.png',
    popDense: '/assets/map-pop-dense.png',
    cityBuilding: '/assets/map-city-building.png',
  },
  ui: {
    auctionBanner: '/assets/ui-auction-banner.png',
    panelHeader: '/assets/ui-panel-header.png',
    appLogo: '/assets/ui-app-logo.png',
    marketHub: '/assets/ui-market-hub.png',
  },
} as const satisfies {
  npcMerchant: string;
  resources: Record<ParcelResourceKind, string>;
  items: Record<ItemId, string>;
  buildings: Record<FactoryTypeId, string>;
  map: {
    road: string;
    cityHub: string;
    popDense: string;
    cityBuilding: string;
  };
  ui: {
    auctionBanner: string;
    panelHeader: string;
    appLogo: string;
    marketHub: string;
  };
};

/** `data-art-slot` 用的穩定鍵，與 public/assets 檔名（不含副檔名）一致。 */
export const MAP_ART_SLOT = {
  road: 'map-road',
  cityHub: 'map-city-hub',
  popDense: 'map-pop-dense',
  cityBuilding: 'map-city-building',
  marketHub: 'ui-market-hub',
} as const;
