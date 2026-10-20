export type LoanProductId = 'working-capital' | 'construction';

export type StockSymbol = 'IRON' | 'PORT' | 'GRID' | 'TOOL';

export type CommodityId = 'copper' | 'coal' | 'yarn' | 'steel';

export type BondId = 'bill' | 'note' | 'long';

export interface BondHolding {
  readonly bondId: BondId;
  readonly units: number;
  /** 買進時鎖定的每期票息，基點。 */
  readonly couponBps: number;
  readonly periodsLeft: number;
  readonly avgCost: number;
}

export interface LoanBook {
  readonly id: string;
  readonly productId: LoanProductId;
  readonly principal: number;
  readonly rateBps: number;
  readonly installment: number;
  readonly ticksRemaining: number;
  readonly arrears: number;
}

export interface StockHolding {
  readonly symbol: StockSymbol;
  readonly shares: number;
  readonly avgCost: number;
}

export interface CommodityHolding {
  readonly commodityId: CommodityId;
  readonly units: number;
  readonly avgCost: number;
}

/** 單一銀行週期結算單。金額皆為整數現金。 */
export interface FinanceSettlement {
  readonly idleInterest: number;
  readonly savingsInterest: number;
  /** 本期滿期、撥回閒置現金的本利和。提前解約不走這欄。 */
  readonly savingsPayout: number;
  readonly loanInterestCharged: number;
  readonly loanInterestPaid: number;
  readonly loanPrincipalPaid: number;
  readonly arrearsAdded: number;
  readonly bondCoupon: number;
  readonly bondRedemption: number;
}

export interface PlayerBank {
  readonly savingsPrincipal: number;
  readonly savingsAccrued: number;
  /** 定期滿期時的 financeTick。0 表示沒有定期。 */
  readonly savingsUnlockTick: number;
  readonly loans: readonly LoanBook[];
  readonly stocks: readonly StockHolding[];
  readonly commodities: readonly CommodityHolding[];
  readonly bonds: readonly BondHolding[];
  readonly lastSettlement: FinanceSettlement | null;
  /** 最近幾期銀行結算，新的在前。 */
  readonly statements: readonly FinanceStatement[];
  /** 交易所掛單。買方現金已圈存。 */
  readonly orders: readonly LimitOrder[];
  /** 最近撮合成交，新的在前。 */
  readonly fills: readonly MarketFill[];
}

export type MarketId = StockSymbol | CommodityId;

export type OrderSide = 'buy' | 'sell';

export interface LimitOrder {
  readonly id: string;
  readonly marketId: MarketId;
  readonly side: OrderSide;
  /** 每股或每手的限價。 */
  readonly limitPrice: number;
  /** 剩餘股數或手數。 */
  readonly quantity: number;
  /** 買方圈存的現金。賣方為 0。 */
  readonly escrow: number;
}

export interface MarketFill {
  readonly id: string;
  readonly tick: number;
  readonly marketId: MarketId;
  readonly side: OrderSide;
  readonly quantity: number;
  readonly price: number;
  readonly cash: number;
}

export interface FinanceStatement {
  readonly tick: number;
  readonly idleInterest: number;
  readonly savingsInterest: number;
  readonly savingsPayout: number;
  readonly loanInterestCharged: number;
  readonly loanPrincipalPaid: number;
  readonly arrearsAdded: number;
}

export interface BankCheck {
  readonly ok: boolean;
  readonly reason?: string;
}

export const ZERO_SETTLEMENT: FinanceSettlement = {
  idleInterest: 0,
  savingsInterest: 0,
  savingsPayout: 0,
  loanInterestCharged: 0,
  loanInterestPaid: 0,
  loanPrincipalPaid: 0,
  arrearsAdded: 0,
  bondCoupon: 0,
  bondRedemption: 0,
};
