/**
 * 銀行利率用基點（1 bps = 0.01%）。
 * 順序必須是：閒置 < 定期 < 建設融資 < 週轉貸款。
 * 借來放著一定虧，避免利率套利壓過「空間效率 × 時間規劃」。
 */
export interface BankConfig {
  /** 閒置現金每期利率。不必存款也會入帳。 */
  readonly idleInterestBps: number;
  readonly savingsInterestBps: number;
  readonly savingsTermTicks: number;
  readonly savingsMinAmount: number;
  readonly loanMinAmount: number;
  /** 無抵押的基礎授信 */
  readonly creditBase: number;
  /** 每塊持有土地增加的授信 */
  readonly creditPerParcel: number;
  /** 定期本金計入授信的比例（bps） */
  readonly creditSavingsRatioBps: number;
  /** 大宗賣價相對買價的折讓 */
  readonly commoditySpreadBps: number;
}

export const DEFAULT_BANK_CONFIG: BankConfig = {
  idleInterestBps: 50,
  savingsInterestBps: 120,
  savingsTermTicks: 4,
  savingsMinAmount: 1_000,
  loanMinAmount: 1_000,
  creditBase: 20_000,
  creditPerParcel: 3_000,
  creditSavingsRatioBps: 5_000,
  commoditySpreadBps: 400,
};
