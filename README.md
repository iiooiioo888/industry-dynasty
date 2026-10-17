# 產業霸權 · Industry Dynasty

**產業霸權**（Industry Dynasty）是一款以「空間效率 × 時間規劃 = 利潤」為核心循環的經濟模擬網頁遊戲。本專案為**完全原創**作品：不複製、不衍生自《創業王》（CEO the Game）的素材、文案、程式或公式。

**Industry Dynasty** is a browser economic simulation whose core loop is _spatial efficiency × time planning = profit_. This repository is **fully original** and does not copy assets, text, code, or formulas from _CEO the Game_ (《創業王》).

---

## 目前進度 · Current scope

| Sprint      | 內容                                                          |
| ----------- | ------------------------------------------------------------- |
| **0**       | Monorepo 骨架、占位型別、地圖壳                               |
| **1（P0）** | 有限地圖／土地狀態、土地拍賣、土地稅與欠稅收回、地圖＋拍賣 UI |
| **2（P0）** | 工廠類型表、建造狀態機、相鄰物流效率、建造 UI                 |
| **3（P0）** | 固定配方、庫存、生產週期、距離／閒置損失、全螢幕控制台 UI     |
| **4（P0）** | NPC 收購、運輸成本、損益報表、25 日淨利目標通關               |
| **地圖**    | 道路網絡、城市據點、人口密集區；人口密度驅動在地收購量與單價  |

**尚未實作**：認證、多人連線、Redis、WebSocket 同步。在地收購量與單價可依土地查詢（`quoteLocalDemand`）。

---

## 環境需求 · Requirements

- [Node.js](https://nodejs.org/) 20+
- [pnpm](https://pnpm.io/) 9+

---

## 安裝 · Install

```bash
pnpm install
```

---

## 開發指令 · Development

| 指令              | 說明                                   |
| ----------------- | -------------------------------------- |
| `pnpm dev`        | 網頁客戶端 `http://127.0.0.1:4317`     |
| `pnpm dev:server` | 伺服器意圖 stub（委派 `packages/sim`） |
| `pnpm test`       | Vitest（含拍賣結算、欠稅→重新拍賣）    |
| `pnpm lint`       | ESLint                                 |
| `pnpm build`      | 建置所有套件                           |

---

## 地圖地理 · Roads, cities, demand

預設 16×12 地圖有三座城市（西灣市、臨港市、南站市）、連接它們的道路，以及貼著路網的人口密集區。

- **道路**與**城市核心**是公共設施，不能拍賣、不能蓋廠。
- **人口密集區**落在可購買的土地上。人口密度越高，在地收購的**每週可售量**與**單價**越高。
- 靠近城市會再抬價、抬量；靠近道路決定這些需求運不運得出去，並小幅提高工廠物流效率。
- 因此密集區土地的拍賣底價也更高。利潤來自買對位置，而不是買最多地。

點選任一格可在「在地市場」看到人口密度、每週可售與收購單價。美術 PNG（`map-road`、`map-city-hub`、`map-pop-dense`、`map-city-building`、`ui-market-hub`）在 `apps/web/public/assets/`，由 `apps/web/src/map/map-feature-art.ts` 疊到對應格子；缺檔時仍以色塊與道路條顯示。

## 本機試玩拍賣流程 · Try the auction flow

1. 執行 `pnpm dev` 並開啟瀏覽器。
2. 在地圖上**點選**一格可購土地（色越暖人口越密；米條＝道路、藍塊＝城市，皆不可買）。
3. 右側「土地拍賣」輸入出價（須 ≥ 建議出價），按 **出價**。
4. 按 **結算拍賣**：得標後現金扣除、該格出現**綠色框**（你的土地），並出現在「持有土地」列表。
5. 按 **推進稅務週期**：每塊土地每週期扣 **$500** 土地稅；若現金不足則累計**欠稅**。
6. **收回門檻**：單一土地累計欠稅達 **$1,500**（= 連續三週各欠 $500）時，土地被收回並**重新上架拍賣**（可在地圖上再次競標）。

常數定義見 `packages/sim/src/world/config.ts`（`landTaxPerTick`、`landTaxReauctionThreshold`）。

## 本機試玩建廠流程 · Try the build flow

1. 先完成拍賣取得土地（見上）。
2. 點選**你的綠色土地** → 「建造選單」選 **小型工坊** 或 **組裝廠**。
3. 按 **推進建設週期**（工坊 3 週期、組裝廠 5 週期）直至完工（藍框＝運營中）。
4. 在相鄰格再建一座工廠，完工後查看 **物流效率係數** 與 **相鄰加成** 數字變化。
5. 建造中可 **取消建造（退 50%）**；完工後可 **拆除** 恢復空地。

工廠參數見 `packages/sim/src/buildings/catalog.ts`。

## 本機試玩生產流程 · Try production

1. 取得土地並建造完工（藍格工廠）。
2. 左側 **庫存** 有起始原礦／樹脂。右側 **產線與技術** 列出礦脈 → 中間件 → 成品。
3. 在對應礦脈上完工工廠後可 **開採**（消耗儲量）。原料入庫 4 單位解鎖冶煉；中間件入庫 2 單位解鎖礦物合金板。零件與熔鑄捷徑一開始就能做。
4. 點選工廠排入配方。產線跟著地圖上的模擬時間自動走；**單步推進**只前進一格，用來對照規劃。煤炭、銅礦、石英砂粒不進收購，要煉成合金板。
5. 觀察 **規劃利潤／週期**、**產出係數**（距離供應樞紐 `(0,0)` 越遠越低）、**距離損失**、**閒置損失**。選中工廠時仍顯示道路／城市區位與在地收購量、單價。
6. 網頁為 **全螢幕產業控制台**（100vw×100vh，欄位內捲動）。

配方表：`packages/sim/src/production/recipes.ts`。

## 銷售與通關（Sprint 4）

1. 生產成品後，在 **NPC 收購** 面板選項目與數量，並選擇**你的土地**作為出貨點（右下角藍格「市」= 港區市場，運輸最便宜）。
2. **結束本日**：稅務、工廠維護、刷新 NPC 收購價。
3. 左側 **P&L** 查看營收、稅、維護、運輸、淨利。
4. **勝利條件**：在 **25 天**內累計**淨利 ≥ $60,000**（`packages/sim/src/sales/scenario.ts`）。

每塊地皮有**獨有礦脈**（鐵脈、樹脂沼、石英砂、煤層、銅頁岩；品質與儲量依座標生成）。開採吃儲量；加工若用到該地關聯原料，仍可從儲量補 1 單位並獲得品質加成。見 `packages/sim/src/world/parcel-resources.ts` 與 `packages/sim/src/production/recipes.ts`。

---

## Docker 測試部署 · Docker test deploy

以 **nginx** 提供 `apps/web` 的 Vite 靜態建置（目前 playable 內容為 **main / Sprint 2**：拍賣、建廠；不含未合併的 Sprint 3 生產）。

**需求**：主機已安裝 [Docker](https://docs.docker.com/engine/install/) 與 Compose plugin。

```bash
# 於專案根目錄（建議路徑範例：/var/www/industry-dynasty/）
git clone <你的 repo URL> /var/www/industry-dynasty
cd /var/www/industry-dynasty
docker compose up -d --build
```

- 容器對外埠：**8080** → 容器內 nginx **80**
- 瀏覽器開啟：**http://47.82.83.20:8080/**（請將 IP 換成你的主機；本範例為測試機 `47.82.83.20`）
- 僅靜態前端；遊戲狀態在瀏覽器本地執行，**無**線上權威伺服器。

停止服務：

```bash
docker compose down
```

### English

Multi-stage image: `pnpm` builds `apps/web`, **nginx:alpine** serves `dist`. Run `docker compose up -d --build` from the repo root; open `http://<your-host>:8080/`. Example test host path: `/var/www/industry-dynasty/`. SSH access is **your** responsibility (e.g. `root` + key); this repo does not store server credentials.

---

## 套件結構 · Package layout

```
apps/
  web/      # Vite + React — 地圖、拍賣面板、資產總覽
  server/   # Node — handlePlayerIntent → applyWorldAction
packages/
  sim/      # 世界狀態、拍賣、土地稅（單元測試）
```

### `packages/sim` 重點模組

- **Map / Parcel** — `empty`｜`owned`｜`building-ready`
- **Auction** — 底價、出價、結算、寫入 `ownerId`
- **Tax** — `ADVANCE_TAX_TICK`、欠稅累積、達門檻重新進入拍賣池

---

## 產品方向（鎖定）· Product direction

1. MVP：買地（拍賣）→ 建工廠 → 生產（固定配方）→ 賣給 NPC
2. 利潤由佈局與路徑品質間接驅動
3. 先單人原型；規則集中在 `sim`，伺服器日後權威化

---

## 授權 · License

尚未指定。
