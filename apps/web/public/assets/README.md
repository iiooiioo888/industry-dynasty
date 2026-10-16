# 美術資源

將 PNG 放入此目錄即可被 UI 自動載入（檔名需與 `apps/web/src/assets/slots.ts` 一致）。

- `npc-merchant.png` — 銷售面板 NPC 頭像

地圖圖層（`MAP_ART_SLOT` / `ASSET_SLOTS.map` 與 `ASSET_SLOTS.ui.marketHub`）：

- `map-road.png` — 道路（`map-road`）
- `map-city-hub.png` — 城市據點（`map-city-hub`）
- `map-pop-dense.png` — 人口密集（`map-pop-dense`）
- `map-city-building.png` — 城市建築（`map-city-building`）
- `ui-market-hub.png` — 港區市場介面提示（`ui-market-hub`）

格子是否貼上這些圖，由 `apps/web/src/map/map-feature-art.ts` 決定：世界已有道路、城市或人口密度時用該資料；否則畫占位。
