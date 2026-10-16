/**
 * 地圖與港區圖已落在 `apps/web/public/assets/`。
 * 格子貼哪一張由 `src/map/map-feature-art.ts` 決定；這裡供在地市場等既有 `ArtSlot` 使用同一批檔。
 * 缺檔時背景圖載入失敗，地圖仍用色塊與道路條顯示，不阻塞遊戲。
 */
export const ART_SLOTS = {
  mapRoad: { id: 'map-road', src: '/assets/map-road.png' },
  mapCityHub: { id: 'map-city-hub', src: '/assets/map-city-hub.png' },
  mapPopDense: { id: 'map-pop-dense', src: '/assets/map-pop-dense.png' },
  mapCityBuilding: { id: 'map-city-building', src: '/assets/map-city-building.png' },
  uiMarketHub: { id: 'ui-market-hub', src: '/assets/ui-market-hub.png' },
} as const;

export type ArtSlotKey = keyof typeof ART_SLOTS;
