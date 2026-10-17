/**
 * 土地轉手 · land resale
 *
 * 讓自有土地能換回現金，補上「圈地投機」策略缺少的出口。
 *
 * ## 為什麼不能照價買回
 *
 * `quoteAuctionMinPrice` 的區位溢價（人口密度、城市距離、道路可及性）是**靜態**的
 * 地塊屬性，同一塊地今天買、明天賣都是同一個價格 —— 照價買回等於零風險套利。
 * 因此轉手價接了兩個東西：
 *
 * 1. **時間**：地價隨天數複利成長（`landAppreciationFactor`）。
 * 2. **折價**：轉手只拿回估價的一部分（`LAND_MARKET.resaleRate`）。
 *
 * 兩者相乘決定持有門檻（見 `landBreakEvenDays()`），所以「圈地」要持有夠久才划算。
 *
 * ## 為什麼估價不含礦藏
 *
 * 礦藏帳面價值（藏量 × 品項單價）每塊地可達數萬，而 `quoteAuctionMinPrice`
 * **完全沒有把礦藏計入底價**。若轉手時把礦藏算進估價，就會變成
 * 「用底價買進、用含礦價賣出」的無風險套利。因此估價刻意與購買價同基準
 * （只含區位），礦藏要靠開採實現，不能靠轉手變現。
 */
import {
  landAppreciationFactor,
  landBreakEvenDays,
  landResaleProceeds,
  LAND_MARKET,
} from '../balance/targets.js';
import type { Parcel } from '../types/map.js';
import { quoteAuctionMinPrice } from './demand.js';
import type { WorldConfig } from './config.js';

type PriceConfig = Pick<WorldConfig, 'auctionMinPriceBase' | 'auctionMinPriceStep'>;

export interface LandSaleQuote {
  readonly parcel: Parcel;
  /** 依區位計算的當期估價（不含礦藏，理由見檔頭） */
  readonly appraisedValue: number;
  /** 地價隨時間成長的倍率 */
  readonly appreciationFactor: number;
  /** 實際可拿回的金額 */
  readonly proceeds: number;
  readonly ok: boolean;
  readonly reason?: string;
}

/**
 * 當期估價 = 區位底價 × 時間成長倍率。
 * 與 `quoteAuctionMinPrice` 同基準，只是多了時間項。
 */
export function appraiseParcel(parcel: Parcel, config: PriceConfig, gameDay: number): number {
  const base = quoteAuctionMinPrice(parcel, config);
  return Math.round(base * landAppreciationFactor(gameDay));
}

/**
 * 轉手報價。
 *
 * 可轉手的條件：地塊屬於該玩家、且地上沒有建築。
 * 已完工的工廠必須先 `DEMOLISH` 才能賣地，避免一個動作同時處分兩種資產。
 */
export function quoteLandSale(
  parcel: Parcel,
  ownerId: string,
  config: PriceConfig,
  gameDay: number,
  hasBuilding: boolean,
): LandSaleQuote {
  const appraisedValue = appraiseParcel(parcel, config, gameDay);
  const base = {
    parcel,
    appraisedValue,
    appreciationFactor: landAppreciationFactor(gameDay),
    proceeds: landResaleProceeds(appraisedValue),
  };
  if (parcel.ownerId !== ownerId) {
    return { ...base, ok: false, reason: '不是你的土地' };
  }
  if (hasBuilding) {
    return { ...base, ok: false, reason: '地上還有建築，請先拆除' };
  }
  return { ...base, ok: true };
}

export { LAND_MARKET, landBreakEvenDays };
