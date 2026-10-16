# 產業霸權 · Industry Dynasty

**產業霸權**（Industry Dynasty）是一款以「空間效率 × 時間規劃 = 利潤」為核心循環的經濟模擬網頁遊戲。本專案為**完全原創**作品：不複製、不衍生自《創業王》（CEO the Game）的素材、文案、程式或公式。

**Industry Dynasty** is a browser economic simulation whose core loop is *spatial efficiency × time planning = profit*. This repository is **fully original** and does not copy assets, text, code, or formulas from *CEO the Game* (《創業王》).

---

## Sprint 0 範圍 · Sprint 0 scope

- Monorepo 骨架：網頁客戶端、Node 伺服器占位、純模擬套件  
- 占位型別：地圖／土地、拍賣、建築、庫存、配方、銷售  
- **尚未實作**：完整拍賣／建造／生產／銷售玩法、認證、多人、Redis、WebSocket 遊戲同步  

---

## 環境需求 · Requirements

- [Node.js](https://nodejs.org/) 20+  
- [pnpm](https://pnpm.io/) 9+（建議使用 repo 內 `packageManager` 版本）

---

## 安裝 · Install

在專案根目錄：

```bash
pnpm install
```

---

## 開發指令 · Development

| 指令 | 說明 |
|------|------|
| `pnpm dev` | 啟動網頁客戶端（Vite，預設 `http://127.0.0.1:4317`） |
| `pnpm dev:server` | 啟動伺服器占位（意圖處理 stub，日誌輸出） |
| `pnpm test` | 執行各套件測試（含 `packages/sim` Vitest） |
| `pnpm lint` | ESLint |
| `pnpm format:check` | Prettier 檢查 |
| `pnpm build` | 建置所有套件 |

啟動網頁：

```bash
pnpm dev
```

啟動伺服器占位：

```bash
pnpm dev:server
```

---

## 套件結構 · Package layout

```
apps/
  web/      # Vite + React — 標題與地圖格子占位
  server/   # Node + TypeScript — 伺服器權威 intent 處理占位
packages/
  sim/      # 純模擬邏輯（無 UI），Vitest 單元測試
```

### `packages/sim` 占位型別

- **Map / Parcel** — 地圖與土地區塊  
- **Auction** — 土地拍賣  
- **Building** — 工廠等建築  
- **Inventory** — 物品庫存  
- **Recipe** — 固定生產配方  
- **Sale** — 對 NPC 銷售  

---

## 產品方向（鎖定）· Product direction

1. MVP：買地（拍賣）→ 建工廠 → 生產（固定配方）→ 賣給 NPC  
2. 利潤由佈局與路徑品質間接驅動，而非直接操控  
3. 先單人原型；之後以 Node 伺服器權威 + 瀏覽器客戶端擴展  

---

## 授權 · License

尚未指定 — 綠地專案 Sprint 0。
