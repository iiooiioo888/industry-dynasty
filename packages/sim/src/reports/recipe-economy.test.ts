import { describe, expect, it } from 'vitest';
import { executeSellToNpc } from '../sales/sell-logic.js';
import { generateNpcBuyOffers } from '../sales/market.js';
import { ITEMS, VALUE_CHAIN, type PlayerStock } from '../production/items.js';
import { RECIPES } from '../production/recipes.js';
import { BALANCE, HOLDING, dailyHoldingCostPerFactory } from '../balance/targets.js';
import { FACTORY_TYPES } from '../buildings/catalog.js';
import { parcelIdFromCoords } from '../types/map.js';
import { generateParcelResource } from '../world/parcel-resources.js';
import type { Parcel } from '../types/map.js';

const MARKET_PARCEL: Parcel = {
  id: parcelIdFromCoords(15, 11),
  x: 15,
  y: 11,
  state: 'building-ready',
  ownerId: 'p',
  resource: generateParcelResource(15, 11),
  role: 'land',
  populationDensity: 100,
  roadAccess: 1,
  cityProximity: 1,
  nearestCityName: null,
  nearestCityDistance: 0,
};

describe('配方毛利：哪條路線真的有錢賺', () => {
  it('每個配方的每週期毛利與每日毛利', () => {
    console.log('\n=== 配方經濟（用港區最佳出貨點，不含運費）===');
    console.log(
      'recipe'.padEnd(20) +
        'in'.padStart(6) +
        'out'.padStart(5) +
        'cycle'.padStart(7) +
        'outVal'.padStart(8) +
        'inVal'.padStart(8) +
        'gross/cycle'.padStart(12) +
        'gross/day'.padStart(11),
    );
    for (const r of Object.values(RECIPES)) {
      const outDef = ITEMS[r.outputItemId];
      const outVal = outDef.unitValue * r.outputQuantity;
      const inVal = r.inputs.reduce((s, i) => s + ITEMS[i.itemId].unitValue * i.quantity, 0);
      const gross = outVal - inVal;
      // 每日 = 每週期毛利 / 週期 tick 數（1 tick ≈ 1 日）
      const perDay = gross / r.baseCycleTicks;
      console.log(
        r.id.padEnd(20) +
          String(r.inputs.length).padStart(6) +
          String(r.outputQuantity).padStart(5) +
          String(r.baseCycleTicks).padStart(7) +
          String(outVal).padStart(8) +
          String(inVal).padStart(8) +
          String(gross).padStart(12) +
          perDay.toFixed(1).padStart(11),
      );
    }
  });

  it('實際賣給 NPC 的淨收入（扣運費與貨值加權）', () => {
    const offers = generateNpcBuyOffers(0);
    console.log('\n=== 港區出貨點的實際淨收入 ===');
    for (const itemId of ['raw-ore', 'resin', 'basic-part', 'alloy-plate'] as const) {
      const offer = offers.find((o) => o.itemId === itemId);
      if (!offer) continue;
      const stock: PlayerStock = { [itemId]: offer.maxQuantity };
      const res = executeSellToNpc(offer, offer.maxQuantity, MARKET_PARCEL, stock, 'p');
      console.log(
        `  ${itemId.padEnd(12)} 牌價 ${String(offer.unitPrice).padStart(4)}` +
          `  淨單價 ${String(res.ok ? offer.unitPrice : 0).padStart(4)}` +
          `  賣 ${String(offer.maxQuantity).padStart(3)} 單位` +
          `  毛收 ${String(res.grossRevenue).padStart(6)}` +
          `  運費 ${String(res.transportCost).padStart(4)}` +
          `  淨收 ${String(res.netCash).padStart(6)}`,
      );
    }
  });

  it('單座工坊 25 天的最高可能毛利', () => {
    let best = { id: '', perDay: 0, total: 0 };
    for (const r of Object.values(RECIPES)) {
      if (!(r.buildings as readonly string[]).includes('workshop')) continue;
      const outVal = ITEMS[r.outputItemId].unitValue * r.outputQuantity * (r.outputMultiplier ?? 1);
      const inVal = r.inputs.reduce((s, i) => s + ITEMS[i.itemId].unitValue * i.quantity, 0);
      const perDay = (outVal - inVal) / r.baseCycleTicks;
      const total = perDay * BALANCE.maxDays;
      if (total > best.total) best = { id: r.id, perDay, total };
    }
    const holdingPerDay = dailyHoldingCostPerFactory();
    const holdingTotal = holdingPerDay * BALANCE.maxDays;
    const buildCost = FACTORY_TYPES.workshop.buildCost;
    console.log('\n=== 單座工坊的理論上限（讀實際常數） ===');
    console.log(
      `  最佳配方 ${best.id}：毛利 ${best.perDay.toFixed(1)}/日 → ${BALANCE.maxDays} 天 ${best.total.toFixed(0)}`,
    );
    console.log(
      `  持有成本 = 維護 ${HOLDING.maintenancePerFactoryPerDay}/日 + 土地稅 ${HOLDING.landTaxPerParcelPerDay}/日 = ${holdingPerDay}/日 → ${BALANCE.maxDays} 天 ${holdingTotal}`,
    );
    console.log(`  建廠成本 ${buildCost}`);
    const net = best.total - holdingTotal - buildCost;
    console.log(
      `  淨利 ${best.total.toFixed(0)} − ${holdingTotal} − ${buildCost} = ${net.toFixed(0)}`,
    );
    console.log(`  → ${net > 0 ? '有利可圖' : '結構性虧損'}`);
    // 護欄：最佳配方必須能覆蓋持有成本與建廠，否則遊戲不可能通關
    expect(net).toBeGreaterThan(0);
  });

  it('開採與加工的每日毛利都在預期水準', () => {
    console.log('\n=== 各配方每週期毛利與每日毛利 ===');
    console.log(
      'recipe'.padEnd(20) +
        'cycle'.padStart(6) +
        'margin/cycle'.padStart(13) +
        'margin/day'.padStart(11) +
        'target/day'.padStart(11),
    );
    for (const r of Object.values(RECIPES)) {
      const outVal = ITEMS[r.outputItemId].unitValue * r.outputQuantity * (r.outputMultiplier ?? 1);
      const inVal = r.inputs.reduce((s, i) => s + ITEMS[i.itemId].unitValue * i.quantity, 0);
      const gross = outVal - inVal;
      const perDay = gross / r.baseCycleTicks;
      const target =
        r.inputs.length === 0
          ? VALUE_CHAIN.extractMarginPerCycle / r.baseCycleTicks
          : VALUE_CHAIN.processingMarginPerDay;
      console.log(
        r.id.padEnd(20) +
          String(r.baseCycleTicks).padStart(6) +
          String(gross).padStart(13) +
          perDay.toFixed(0).padStart(11) +
          target.toFixed(0).padStart(11),
      );
    }
    // 護欄：不得有配方在價值鏈推導下反而虧錢
    for (const r of Object.values(RECIPES)) {
      const outVal = ITEMS[r.outputItemId].unitValue * r.outputQuantity * (r.outputMultiplier ?? 1);
      const inVal = r.inputs.reduce((s, i) => s + ITEMS[i.itemId].unitValue * i.quantity, 0);
      expect(outVal - inVal, `${r.id} 加工後反而虧錢`).toBeGreaterThan(0);
    }
  });

  it('加工讓不可販售的礦脈得以變現，且報酬與最佳開採同量級', () => {
    const perTick = (r: (typeof RECIPES)[keyof typeof RECIPES]): number => {
      const outVal = ITEMS[r.outputItemId].unitValue * r.outputQuantity * (r.outputMultiplier ?? 1);
      const inVal = r.inputs.reduce((s, i) => s + ITEMS[i.itemId].unitValue * i.quantity, 0);
      return (outVal - inVal) / r.baseCycleTicks;
    };
    const extraction = Object.values(RECIPES).filter((r) => r.inputs.length === 0);
    const processing = Object.values(RECIPES).filter((r) => r.inputs.length > 0);
    const bestExtract = Math.max(...extraction.map(perTick));

    console.log('\n=== 每刻報酬 ===');
    for (const r of extraction) {
      console.log(
        `  [開採] ${r.id.padEnd(18)} ${perTick(r).toFixed(0).padStart(6)}/刻` +
          `  sellable=${ITEMS[r.outputItemId].sellable}`,
      );
    }
    for (const r of processing) {
      console.log(
        `  [加工] ${r.id.padEnd(18)} ${perTick(r).toFixed(0).padStart(6)}/刻` +
          `  sellable=${ITEMS[r.outputItemId].sellable}`,
      );
    }

    // 開採的每刻報酬由「產出倍率 × 品項單價」決定，而鐵礦兩者都最高，
    // 所以它是唯一的天花板（1,500/刻）。加工不必贏過它才算合理 ——
    // 加工的價值在於**讓其餘三分之二的地圖能用**。
    const ironTick = perTick(RECIPES['extract-iron']);

    // 護欄一：加工報酬必須與最佳開採同量級（至少六成）。
    // 低於此就會出現「整張圖只有鐵礦值得蓋」的退化玩法。
    // 門檻取六成而非更高，是因為鐵礦同時擁有最高單價與 6 倍產出倍率，
    // 是刻意的天花板；加工不必追上它，只要不被它甩開。
    for (const r of processing) {
      expect(
        perTick(r),
        `${r.id} 每刻 ${perTick(r).toFixed(0)} 遠低於鐵礦的 ${ironTick.toFixed(0)}`,
      ).toBeGreaterThan(ironTick * 0.6);
    }

    // 護欄二：不可販售的礦脈，加工後每刻報酬必須嚴格為正 ——
    // 那些礦脈不加工就是 0 收入，加工是它們唯一的變現途徑。
    const deadExtraction = extraction.filter((r) => !ITEMS[r.outputItemId].sellable);
    expect(deadExtraction.length).toBeGreaterThan(0);
    for (const extract of deadExtraction) {
      const consumers = processing.filter((r) =>
        r.inputs.some((i) => i.itemId === extract.outputItemId),
      );
      expect(consumers.length, `${extract.outputItemId} 沒有配方能消化`).toBeGreaterThan(0);
      for (const c of consumers) {
        expect(perTick(c), `${c.id} 消化 ${extract.outputItemId} 卻不賺錢`).toBeGreaterThan(0);
      }
    }

    // 護欄三：使用不可販售礦脈的加工配方，必須存在
    //（否則那三分之二的地圖仍然無用）
    const usesDeadVein = processing.filter((r) =>
      r.inputs.some((i) => deadExtraction.some((e) => e.outputItemId === i.itemId)),
    );
    expect(usesDeadVein.length).toBeGreaterThan(0);
    console.log(`\n  可消化不可販售礦脈的配方：${usesDeadVein.map((r) => r.id).join(', ')}`);
    void bestExtract;
  });
});
