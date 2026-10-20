import { LOAN_PRODUCTS } from './catalog.js';
import type { BondId, LoanProductId } from './types.js';

/** 四個銀行期當成一年，方便把每期基點換成現代的年化利率。 */
export const PERIODS_PER_YEAR = 4;

/** 相對政策利率的年化利差。第 0–3 期會還原成目前的 0.50% / 1.20% / 2.20% / 2.80%。 */
const ANNUAL_SPREADS = {
  idle: 0,
  savings: 280,
  construction: 680,
  'working-capital': 920,
  bill: 40,
  note: 80,
  long: 120,
} as const;

const POLICY_PATH = [200, 225, 250, 225, 200, 175] as const;
const INFLATION_PATH = [175, 200, 225, 200, 175, 150] as const;

export interface BondDef {
  readonly id: BondId;
  readonly nameZh: string;
  readonly periods: number;
  readonly face: number;
}

export const BONDS: Record<BondId, BondDef> = {
  bill: { id: 'bill', nameZh: '國庫券', periods: 4, face: 1_000 },
  note: { id: 'note', nameZh: '中期公債', periods: 8, face: 1_000 },
  long: { id: 'long', nameZh: '長期公債', periods: 12, face: 1_000 },
};

export const BOND_LIST: readonly BondDef[] = [BONDS.bill, BONDS.note, BONDS.long];

export interface RateQuote {
  readonly policyAnnualBps: number;
  readonly inflationAnnualBps: number;
  readonly realAnnualBps: number;
  readonly idleBps: number;
  readonly savingsBps: number;
  readonly constructionBps: number;
  readonly workingCapitalBps: number;
  readonly billBps: number;
  readonly noteBps: number;
  readonly longBps: number;
}

export function policyAnnualBps(tick: number): number {
  const step = Math.floor(Math.max(0, tick) / PERIODS_PER_YEAR);
  return POLICY_PATH[step % POLICY_PATH.length] ?? POLICY_PATH[0];
}

export function inflationAnnualBps(tick: number): number {
  const step = Math.floor(Math.max(0, tick) / PERIODS_PER_YEAR);
  return INFLATION_PATH[step % INFLATION_PATH.length] ?? INFLATION_PATH[0];
}

export function periodBps(annualBps: number): number {
  return Math.round(annualBps / PERIODS_PER_YEAR);
}

export function quoteRates(tick: number): RateQuote {
  const policy = policyAnnualBps(tick);
  const inflation = inflationAnnualBps(tick);
  return {
    policyAnnualBps: policy,
    inflationAnnualBps: inflation,
    realAnnualBps: policy - inflation,
    idleBps: periodBps(policy + ANNUAL_SPREADS.idle),
    savingsBps: periodBps(policy + ANNUAL_SPREADS.savings),
    constructionBps: periodBps(policy + ANNUAL_SPREADS.construction),
    workingCapitalBps: periodBps(policy + ANNUAL_SPREADS['working-capital']),
    billBps: periodBps(policy + ANNUAL_SPREADS.bill),
    noteBps: periodBps(policy + ANNUAL_SPREADS.note),
    longBps: periodBps(policy + ANNUAL_SPREADS.long),
  };
}

export function loanPeriodBps(tick: number, productId: LoanProductId): number {
  const rates = quoteRates(tick);
  return productId === 'construction' ? rates.constructionBps : rates.workingCapitalBps;
}

export function bondYieldBps(tick: number, bondId: BondId): number {
  const rates = quoteRates(tick);
  if (bondId === 'bill') return rates.billBps;
  if (bondId === 'note') return rates.noteBps;
  return rates.longBps;
}

/** 固定票息、剩餘期數，用目前殖利率折現。殖利率上升時價格下降。 */
export function bondPrice(
  face: number,
  couponBps: number,
  periodsLeft: number,
  yieldBps: number,
): number {
  if (periodsLeft <= 0) {
    return face;
  }
  const yieldRate = yieldBps / 10_000;
  const coupon = (face * couponBps) / 10_000;
  if (yieldRate === 0) {
    return Math.round(coupon * periodsLeft + face);
  }
  let present = 0;
  for (let period = 1; period <= periodsLeft; period += 1) {
    present += coupon / (1 + yieldRate) ** period;
  }
  present += face / (1 + yieldRate) ** periodsLeft;
  return Math.max(1, Math.round(present));
}

export function quoteBond(bondId: BondId, tick: number, periodsLeft = BONDS[bondId].periods, couponBps?: number) {
  const def = BONDS[bondId];
  const yieldBps = bondYieldBps(tick, bondId);
  const coupon = couponBps ?? yieldBps;
  return {
    ...def,
    yieldBps,
    couponBps: coupon,
    periodsLeft,
    price: bondPrice(def.face, coupon, periodsLeft, yieldBps),
  };
}

export function catalogLoanRate(productId: LoanProductId): number {
  return LOAN_PRODUCTS[productId].rateBps;
}
