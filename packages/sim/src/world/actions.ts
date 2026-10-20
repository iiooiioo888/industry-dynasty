import type { CommodityId, LoanProductId, StockSymbol } from '../bank/types.js';
import type { StaffRole } from '../commerce/types.js';
import type { ItemId } from '../production/items.js';
import type { ClockSpeed } from './clock.js';
import type { FactoryTypeId } from '../buildings/catalog.js';
import type { MachineGradeId } from '../production/machines.js';
import type { RecipeId } from '../production/recipes.js';
import type { ParcelId } from '../types/map.js';

export type WorldAction =
  | { type: 'BID'; parcelId: ParcelId; amount: number }
  | { type: 'SETTLE_AUCTION'; parcelId: ParcelId }
  | { type: 'ADVANCE_TAX_TICK' }
  | { type: 'ADVANCE_FINANCE_TICK' }
  | { type: 'OPEN_SAVINGS'; amount: number }
  | { type: 'WITHDRAW_SAVINGS' }
  | { type: 'DRAW_LOAN'; productId: LoanProductId; amount: number }
  | { type: 'REPAY_LOAN'; loanId: string; amount: number }
  | { type: 'BUY_STOCK'; symbol: StockSymbol; shares: number }
  | { type: 'SELL_STOCK'; symbol: StockSymbol; shares: number }
  | { type: 'BUY_COMMODITY'; commodityId: CommodityId; lots: number }
  | { type: 'SELL_COMMODITY'; commodityId: CommodityId; lots: number }
  | { type: 'START_BUILD'; parcelId: ParcelId; factoryTypeId: FactoryTypeId }
  | { type: 'ADVANCE_BUILD_TICK' }
  | { type: 'CANCEL_BUILD'; parcelId: ParcelId }
  | { type: 'DEMOLISH'; parcelId: ParcelId }
  /**
   * 把自有土地轉手變現。
   *
   * 沒有這個動作時，買來的地只能一直繳稅、永遠無法換回現金 ——
   * 圈地投機因此是個沒有出口的資金黑洞。轉手價為估價乘上
   * `LAND_MARKET.resaleRate`，而估價隨天數複利成長，
   * 所以「持有夠久才可能獲利」，不是零風險套利。
   */
  | { type: 'SELL_LAND'; parcelId: ParcelId }
  | {
      type: 'START_PRODUCTION';
      parcelId: ParcelId;
      recipeId: RecipeId;
      /** 加工線可裝。開採線會忽略，避免用加工機白付維護。 */
      machineGradeId?: MachineGradeId;
    }
  | { type: 'INSTALL_MACHINE'; parcelId: ParcelId; machineGradeId: MachineGradeId }
  | { type: 'STOP_PRODUCTION'; parcelId: ParcelId }
  | { type: 'ADVANCE_PRODUCTION_TICK' }
  | { type: 'SELL_TO_NPC'; offerId: string; quantity: number; shipFromParcelId: ParcelId }
  | { type: 'SET_SHELF'; parcelId: ParcelId; itemId: ItemId; unitPrice: number; quantity: number }
  | { type: 'ACCEPT_CONTRACT'; contractId: string; shipFromParcelId: ParcelId }
  | { type: 'HIRE_STAFF'; role: StaffRole; count: number }
  | { type: 'FIRE_STAFF'; role: StaffRole; count: number }
  | { type: 'START_RESEARCH'; parcelId: ParcelId }
  | { type: 'BUY_CAMPAIGN'; cityId: string }
  | { type: 'ADVANCE_DAY' }
  | { type: 'SET_CLOCK'; paused?: boolean; speed?: ClockSpeed }
  | { type: 'ADVANCE_SIM_TIME'; deltaMs: number };
