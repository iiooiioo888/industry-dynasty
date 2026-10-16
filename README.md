# 產業霸權 · Industry Dynasty

**產業霸權**（Industry Dynasty）是一款以「空間效率 × 時間規劃 = 利潤」為核心循環的經濟模擬網頁遊戲。本專案為**完全原創**作品：不複製、不衍生自《創業王》（CEO the Game）的素材、文案、程式或公式。

**Industry Dynasty** is a browser economic simulation whose core loop is *spatial efficiency × time planning = profit*. This repository is **fully original** and does not copy assets, text, code, or formulas from *CEO the Game* (《創業王》).

---

## 目前進度 · Current scope

| Sprint | 內容 |
|--------|------|
| **0** | Monorepo 骨架、占位型別、地圖壳 |
| **1（P0）** | 有限地圖／土地狀態、土地拍賣、土地稅與欠稅收回、地圖＋拍賣 UI |

**尚未實作**：工廠建造、生產、銷售、認證、多人連線、Redis、WebSocket 同步。

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

| 指令 | 說明 |
|------|------|
| `pnpm dev` | 網頁客戶端 `http://127.0.0.1:4317` |
| `pnpm dev:server` | 伺服器意圖 stub（委派 `packages/sim`） |
| `pnpm test` | Vitest（含拍賣結算、欠稅→重新拍賣） |
| `pnpm lint` | ESLint |
| `pnpm build` | 建置所有套件 |

---

## 本機試玩拍賣流程 · Try the auction flow

1. 執行 `pnpm dev` 並開啟瀏覽器。  
2. 在地圖上**點選**一格空地（灰格＝可拍賣）。  
3. 右側「土地拍賣」輸入出價（須 ≥ 建議出價），按 **出價**。  
4. 按 **結算拍賣**：得標後現金扣除、該格變為**你的土地**（綠格），並出現在「持有土地」列表。  
5. 按 **推進稅務週期**：每塊土地每週期扣 **$500** 土地稅；若現金不足則累計**欠稅**。  
6. **收回門檻**：單一土地累計欠稅達 **$1,500**（= 連續三週各欠 $500）時，土地被收回並**重新上架拍賣**（可在地圖上再次競標）。

常數定義見 `packages/sim/src/world/config.ts`（`landTaxPerTick`、`landTaxReauctionThreshold`）。

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
