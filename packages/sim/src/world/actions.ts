import type { CommodityId, LoanProductId, StockSymbol } from '../bank/types.js';
import type { FactoryTypeId } from '../buildings/catalog.js';
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
  | { type: 'START_PRODUCTION'; parcelId: ParcelId; recipeId: RecipeId }
  | { type: 'STOP_PRODUCTION'; parcelId: ParcelId }
  | { type: 'ADVANCE_PRODUCTION_TICK' }
  | { type: 'SELL_TO_NPC'; offerId: string; quantity: number; shipFromParcelId: ParcelId }
  | { type: 'ADVANCE_DAY' };
