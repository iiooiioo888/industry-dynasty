import { getPlayerHoldings } from '../world/state.js';
import type { WorldState } from '../world/state.js';
import { DEFAULT_WORLD_CONFIG } from '../world/config.js';
import { quoteLandSale } from '../world/land-sale.js';

/**
 * 賣地看板 · land sale board
 *
 * `SELL_LAND` 這個動作在早期就做進模擬了（含估價、增值係數、轉手折價，
 * 以及「排除礦脈儲量、避免投機套利」的設計），但**一直沒有 UI** ——
 * 玩家買了地之後只能放著，或整局結束。
 *
 * 這裡把每塊地的轉手資訊整理出來：估價、可拿回的現金、買進成本、
 * 賺賠，以及不能賣的原因（地上有建築就得先拆）。
 */
export interface LandSaleRow {
  readonly parcelKey: string;
  readonly x: number;
  readonly y: number;
  readonly appraisedValue: number;
  /** 實際會入帳的金額（扣掉轉手折價） */
  readonly proceeds: number;
  /** 當初的取得成本（拍賣價）；未知時為 null */
  readonly costBasis: number | null;
  /** 賺賠（proceeds − costBasis）；未知時為 null */
  readonly gain: number | null;
  /** 現在能不能賣 */
  readonly canSell: boolean;
  /** 不能賣的原因 */
  readonly blockedReason: string | null;
  /** 一句話說明該不該賣 */
  readonly advice: string;
}

export interface LandSaleBoard {
  readonly rows: readonly LandSaleRow[];
  /** 可以立刻賣的張數 */
  readonly sellable: number;
  /** 全部可賣土地的總入帳金額 */
  readonly totalProceeds: number;
}

/**
 * 整理玩家持有的土地，算出每塊地的轉手資訊。
 *
 * `costBasis` 取自拍賣成交紀錄（`auctionLots`）；沒有紀錄時視為未知，
 * 不硬猜 —— 猜錯會讓玩家做出錯誤決定。
 */
export function landSaleBoard(state: WorldState): LandSaleBoard {
  const playerId = state.localPlayerId;
  const config = DEFAULT_WORLD_CONFIG;
  const holdings = getPlayerHoldings(state, playerId);
  const rows: LandSaleRow[] = [];

  for (const parcel of holdings) {
    const hasBuilding = state.sites[parcel.id.value] !== undefined;
    const quote = quoteLandSale(parcel, playerId, config, state.gameDay, hasBuilding);
    // 成本基準取自拍賣紀錄（成交價）；沒有紀錄就視為未知，不硬猜
    const lot = state.auctionLots.find(
      (entry) =>
        entry.parcelId.value === parcel.id.value &&
        entry.highBidderId === playerId &&
        entry.highBid > 0,
    );
    const costBasis = lot?.highBid ?? null;
    const gain = costBasis === null ? null : quote.proceeds - costBasis;

    let advice: string;
    if (!quote.ok) {
      advice = quote.reason ?? '現在不能轉手';
    } else if (gain === null) {
      advice = `可入帳 $${quote.proceeds.toLocaleString()}`;
    } else if (gain >= 0) {
      advice = `可入帳 $${quote.proceeds.toLocaleString()}（比買價多 $${gain.toLocaleString()}）`;
    } else {
      advice = `可入帳 $${quote.proceeds.toLocaleString()}（比買價少 $${Math.abs(gain).toLocaleString()}）`;
    }

    rows.push({
      parcelKey: parcel.id.value,
      x: parcel.x,
      y: parcel.y,
      appraisedValue: quote.appraisedValue,
      proceeds: quote.proceeds,
      costBasis,
      gain,
      canSell: quote.ok,
      blockedReason: quote.ok ? null : (quote.reason ?? null),
      advice,
    });
  }

  rows.sort((a, b) => a.parcelKey.localeCompare(b.parcelKey));
  const sellableRows = rows.filter((row) => row.canSell);
  return {
    rows,
    sellable: sellableRows.length,
    totalProceeds: sellableRows.reduce((sum, row) => sum + row.proceeds, 0),
  };
}
