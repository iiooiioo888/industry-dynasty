/**
 * 平衡基準 · balance targets
 *
 * 這個檔案的目的：讓「遊戲是否可通關」變成**可計算、可測試**的事實，
 * 而不是靠手感調数字。
 *
 * 推導方式（以單座工坊為單位，量測迴圈的 1 次生產推進 ≈ 1 經濟日）：
 *
 *   每座工廠每日淨貢獻 = 每日毛利 − (土地稅 + 維護)
 *   通關需要          = Σ(每座工廠每日淨貢獻 × 可營運天數) ≥ 通關門檻
 *
 * **與 P0 規劃時鐘的假設：** 正式遊玩一個規劃日是 48 個模擬刻
 * （`SIM_TICKS_PER_DAY`），出貨要走完路程才入帳，日結只走 `settledDayIndex`。
 * 本檔的稅、維護與毛利是在「一次生產推進 + 一次 `ADVANCE_DAY`」上校準的。
 * `reports/full-loop.ts` 與 `reports/simulate.ts` 會把在途貨用正式結算函式入帳，
 * 但不會把那 48 刻的產能灌進同一個經濟日。因此護欄證明的是這套數值在
 * 經濟日模型下可通關；實機若連續跑滿 48 刻，產能會更高、通關更容易。
 * 這次沒有改 P0 時鐘去遷就舊量測。
 *
 * 量測基準（見 `reports/full-loop-measure.test.ts`）：
 * 修正前單座工坊最佳配方（開採鐵礦）每日毛利僅 50，
 * 而土地稅 500 + 維護 250 = 750/日 → 結構性虧損，任何策略都不可能通關。
 */
import type { FactoryTypeId } from '../buildings/catalog.js';

/** 通關設計目標：在 25 天內、以 6 座工廠達成。 */
export const BALANCE = {
  /**
   * 通關門檻（淨利）。
   *
   * 單座鐵礦工坊在經濟日模型裡要過得了這道門。
   * 加工與成品的名目單價高於賣礦，但距離指數會在遠址把溢價吃掉；
   * 門檻本身不強迫玩家往下游走，下游是短路程才划算的選擇。
   */
  targetNetProfit: 30_000,
  /**
   * 工業化門檻：累計**加工產值**（所有非原料產出的帳面價值）。
   *
   * 為什麼需要第二個維度：只有淨利門檻時，「買一塊地、蓋一座礦場、挖礦轉賣」
   * 就能過關，整條加工鏈可以完全跳過 —— 遊戲在有趣的部分開始前就結束了。
   *
   * 原型《創業王》的關卡目標本來就是**多維度**的
   * （`Stages.csv` 的 22 關同時要求年獲利／資產／現金／清償貸款），
   * 而不是單一數字。這裡取其中最能把玩家推向產業鏈的一維：
   * 你有沒有真的把原料變成產品。純開採的加工產值恆為 0，必然無法達標。
   *
   * 數值由 `reports/industrialization.test.ts` 量測校準（經濟日模型、
   * 一天一次生產推進）。校準結果：
   *
   * | 配置 | 淨利 | 加工產值 | 判定 |
   * | --- | --- | --- | --- |
   * | 純開採 1～8 塊地 | 19,658～67,107 | **0** | 無法通關 |
   * | 一階加工 3 塊地 | 59,848 | 39,000 | 通關 |
   * | 一階加工 8 塊地 | 105,476 | 130,000 | 通關 |
   * | 二階加工 6 塊地 | 103,419 | 164,000 | 通關 |
   * | 二階加工 3 塊地 | 19,321 | 39,000 | 資金不足 |
   */
  targetCraftedValue: 36_000,
  /**
   * 清償貸款門檻（累計償還金額）。
   *
   * 原型《創業王》的關卡除了獲利，還有「清償貸款」這一維。這裡做成第三條
   * 勝利路線：**淨利達標 且 期末零負債 且 累計清償 ≥ 此值**。
   *
   * 為什麼要綁「淨利達標」與「期末零負債」：只算累計清償的話，
   * 「借一筆、立刻用同一筆錢還掉」就能刷滿 —— 那是套利，不是經營。
   * 綁住獲利與零負債之後，要清償到這個金額就必須真的賺到錢、並把債還乾淨。
   */
  targetDebtRepaid: 40_000,
  /** 通關天數上限 */
  maxDays: 25,
  /** 設計上假設玩家能經營的工廠數 */
  designFactoryCount: 6,
  /** 建廠到開始回收的合理回本期（日） */
  paybackDays: 6,
  /** 每座工廠每日應產出的毛利目標（未扣持有成本） */
  targetGrossMarginPerDay: 250,
} as const;

/** 每座工廠的每日持有成本。 */
export const HOLDING = {
  /** 土地稅：每塊地每日 */
  landTaxPerParcelPerDay: 30,
  /** 工廠維護：每座每日 */
  maintenancePerFactoryPerDay: 40,
} as const;

/** 單座工廠每日持有成本 */
export function dailyHoldingCostPerFactory(): number {
  return HOLDING.landTaxPerParcelPerDay + HOLDING.maintenancePerFactoryPerDay;
}

/**
 * 在 `designFactoryCount` 座工廠、`maxDays` 天的前提下，
 * 達到 `targetNetProfit` 所需的每座工廠每日毛利。
 *
 * 注意分子不退還資本支出 —— 建廠費用在 PnL 內是費用，不回沖。
 */
export function requiredGrossMarginPerFactoryPerDay(
  buildCost: number,
  factoryCount: number = BALANCE.designFactoryCount,
  days: number = BALANCE.maxDays,
  target: number = BALANCE.targetNetProfit,
): number {
  const holdingPerFactory = dailyHoldingCostPerFactory() * days;
  const capitalPerFactory = buildCost;
  // 總成本 = 資本支出 + 持有成本；需要 (總成本 + 通關門檻) / (工廠數 × 天數)
  return (capitalPerFactory + holdingPerFactory + target / factoryCount) / days;
}

/** 檢查一組參數是否讓遊戲可通關，回傳實際可達成的淨利。 */
export function projectNetProfit(args: {
  readonly grossMarginPerFactoryPerDay: number;
  readonly buildCost: number;
  readonly factoryCount: number;
  readonly days: number;
}): number {
  const perFactory = args.grossMarginPerFactoryPerDay * args.days;
  const gross = perFactory * args.factoryCount;
  const costs = (args.buildCost + dailyHoldingCostPerFactory() * args.days) * args.factoryCount;
  return Math.round(gross - costs);
}

/** 各工廠類型的每日毛利目標倍率（組裝廠處理較高階配方）。 */
export const FACTORY_MARGIN_MULTIPLIER: Record<FactoryTypeId, number> = {
  workshop: 1,
  'assembly-plant': 1.8,
  storefront: 1,
  lab: 1,
};

/**
 * 土地轉手的設計參數。
 *
 * 原本 `WorldAction` 沒有任何賣地或增值機制，所以「圈地投機」買到的地
 * **永遠無法變現** —— 它只會一直繳土地稅直到破產，是個沒有出口的資金黑洞。
 * 這裡補上出口，並讓它成為一個**有風險的**策略而非無腦套利：
 *
 * - `appreciationPerDay`：地價每日複利成長。這是唯一的動態項；
 *   `quoteAuctionMinPrice` 的區位溢價是靜態的，若照價買賣會變成零風險套利
 *   （買進賣出同價），所以地價必須隨時間變動。
 * - `resaleRate`：轉手只能拿回估價的一部分，模擬交易成本與折價。
 *
 * 兩者相乘決定持有門檻：`appreciationPerDay > 1 / resaleRate` 的持有天數才可能獲利。
 * 以預設值計算，約需持有 `ln(1/0.85)/ln(1.008) ≈ 21` 天才能打平 ——
 * 因此「圈地」只有在接近通關期限時才划算，而不是隨時都能無風險出場。
 */
export const LAND_MARKET = {
  /**
   * 地價每日複利成長率。
   *
   * 這個值必須打得過 `quoteAuctionMinPrice` 的**區位溢價**才會有意義：
   * 區位溢價可達 4,200（人口密度、城市距離、道路可及性），
   * 買方付的是含溢價的底價，所以地價成長必須相對夠快，
   * 否則持有再久也追不上買進成本（實測 1.8%/日 時永遠無法獲利）。
   *
   * 但也不能太快：4.5%/日 配上 15% 折價時，最佳策略變成
   * **完全不要經營工廠**，只反覆買地等 4 天轉手 ——
   * 實測淨利 +184,122，是正常經營（約 +20,000）的 9 倍。
   * 2.2%/日 讓持有門檻落在 8 天，仍在 25 天期限內可獲利，
   * 但必須押注較長時間、且會排擠建廠資金。
   */
  appreciationPerDay: 0.022,
  /** 轉手可取回的估價比例。折價越高，短線進出越不划算。 */
  resaleRate: 0.7,
} as const;

/** 持有 `days` 天後的地價成長倍率。 */
export function landAppreciationFactor(days: number): number {
  return (1 + LAND_MARKET.appreciationPerDay) ** Math.max(0, days);
}

/** 轉手實際可拿回的金額。 */
export function landResaleProceeds(appraisedValue: number): number {
  return Math.floor(appraisedValue * LAND_MARKET.resaleRate);
}

/** 持有幾天後轉手才不虧（以同一個估價基準計算）。 */
export function landBreakEvenDays(): number {
  if (LAND_MARKET.resaleRate >= 1) {
    return 0;
  }
  return Math.ceil(
    Math.log(1 / LAND_MARKET.resaleRate) / Math.log(1 + LAND_MARKET.appreciationPerDay),
  );
}
