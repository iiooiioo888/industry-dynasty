/**
 * 美術軌會把 PNG 放到 `apps/web/public/art/`。
 * 缺檔時背景圖載入失敗，地圖仍用色塊與道路條顯示，不阻塞遊戲。
 */
export const ART_SLOTS = {
  mapRoad: { id: 'map-road', src: '/art/map-road.png' },
  mapCityHub: { id: 'map-city-hub', src: '/art/map-city-hub.png' },
  mapPopDense: { id: 'map-pop-dense', src: '/art/map-pop-dense.png' },
  mapCityBuilding: { id: 'map-city-building', src: '/art/map-city-building.png' },
  uiMarketHub: { id: 'ui-market-hub', src: '/art/ui-market-hub.png' },
} as const;

export type ArtSlotKey = keyof typeof ART_SLOTS;
