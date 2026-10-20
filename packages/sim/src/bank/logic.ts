import { FACTORY_TYPES } from '../buildings/catalog.js';
import { ITEMS } from '../production/items.js';
import type { Player, WorldState } from '../world/state.js';
import type { WorldConfig } from '../world/config.js';
import { DEFAULT_WORLD_CONFIG } from '../world/config.js';
import { quoteAuctionMinPrice } from '../world/demand.js';
import { COMMODITIES, LOAN_PRODUCTS, STOCKS } from './catalog.js';
import { cancelLimit, fillOrders, placeLimit } from './exchange.js';
import { DEFAULT_BANK_CONFIG, type BankConfig } from './config.js';
import { interestOn, quoteCommodityAsk, quoteCommodityBid, quoteStock } from './quotes.js';
import {
  ZERO_SETTLEMENT,
  type BankCheck,
  type CommodityHolding,
  type CommodityId,
  type FinanceSettlement,
  type LoanBook,
  type LoanProductId,
  type MarketId,
  type OrderSide,
  type PlayerBank,
  type StockHolding,
  type StockSymbol,
} from './types.js';

export function emptyPlayerBank(): PlayerBank {
  return {
    savingsPrincipal: 0,
    savingsAccrued: 0,
    savingsUnlockTick: 0,
    loans: [],
    stocks: [],
    commodities: [],
    lastSettlement: null,
    statements: [],
    orders: [],
    fills: [],
  };
}

export function getPlayerBank(state: WorldState, playerId: string): PlayerBank {
  return state.bank[playerId] ?? emptyPlayerBank();
}

export interface BankSnapshot {
  readonly financeTick: number;
  readonly cash: number;
  readonly nominalIdleInterest: number;
  readonly savingsPrincipal: number;
  readonly savingsAccrued: number;
  readonly savingsUnlockTick: number;
  readonly savingsPeriodsLeft: number;
  readonly debtPrincipal: number;
  readonly debtArrears: number;
  readonly debt: number;
  readonly creditLimit: number;
  readonly creditUsed: number;
  readonly creditAvailable: number;
  readonly creditFrozen: boolean;
  readonly stockValue: number;
  readonly commodityBidValue: number;
  readonly landValue: number;
  readonly factoryValue: number;
  readonly inventoryValue: number;
  readonly shelfValue: number;
  readonly netWorth: number;
}

export interface WeekPreview {
  readonly taxPaid: number;
  readonly settlement: FinanceSettlement;
  readonly cashAfter: number;
  readonly financeTickAfter: number;
}

function isPositiveInt(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

function writeBook(state: WorldState, player: Player, book: PlayerBank): WorldState {
  return {
    ...state,
    players: { ...state.players, [player.id]: player },
    bank: { ...state.bank, [player.id]: book },
  };
}

function localPlayer(state: WorldState): Player | undefined {
  return state.players[state.localPlayerId];
}

export function creditLimitFor(state: WorldState, playerId: string, config: BankConfig): number {
  const parcels = state.map.parcels.filter((parcel) => parcel.ownerId === playerId).length;
  const book = getPlayerBank(state, playerId);
  const savingsBoost = interestOn(book.savingsPrincipal, config.creditSavingsRatioBps);
  return config.creditBase + parcels * config.creditPerParcel + savingsBoost;
}

export function debtOf(book: PlayerBank): { principal: number; arrears: number } {
  return book.loans.reduce(
    (sum, loan) => ({
      principal: sum.principal + loan.principal,
      arrears: sum.arrears + loan.arrears,
    }),
    { principal: 0, arrears: 0 },
  );
}

export function summarizeBank(
  state: WorldState,
  config: WorldConfig = DEFAULT_WORLD_CONFIG,
): BankSnapshot {
  const player = localPlayer(state);
  const book = getPlayerBank(state, state.localPlayerId);
  const cash = player?.cash ?? 0;
  const bank = config.bank;
  const limit = creditLimitFor(state, state.localPlayerId, bank);
  const debt = debtOf(book);
  const creditUsed = debt.principal + debt.arrears;
  const creditFrozen = debt.arrears > 0;
  const stockValue = book.stocks.reduce(
    (sum, holding) => sum + quoteStock(holding.symbol, state.financeTick) * holding.shares,
    0,
  );
  const commodityBidValue = book.commodities.reduce((sum, holding) => {
    const ask = quoteCommodityAsk(holding.commodityId, state.financeTick);
    const bid = quoteCommodityBid(ask, bank.commoditySpreadBps);
    return sum + bid * holding.units;
  }, 0);
  const periodsLeft =
    book.savingsPrincipal > 0 ? Math.max(0, book.savingsUnlockTick - state.financeTick) : 0;
  const playerId = state.localPlayerId;
  const landValue = state.map.parcels.reduce((sum, parcel) => {
    if (parcel.ownerId !== playerId || parcel.role !== 'land') {
      return sum;
    }
    return sum + quoteAuctionMinPrice(parcel, config);
  }, 0);
  const factoryValue = Object.values(state.sites).reduce((sum, site) => {
    if (site.ownerId !== playerId) {
      return sum;
    }
    return sum + FACTORY_TYPES[site.factoryTypeId].buildCost;
  }, 0);
  const inventoryValue = inventoryBookValue(state.inventories[playerId]);
  const shelfValue = shelfBookValue(state, playerId);

  return {
    financeTick: state.financeTick,
    cash,
    nominalIdleInterest: interestOn(cash, bank.idleInterestBps),
    savingsPrincipal: book.savingsPrincipal,
    savingsAccrued: book.savingsAccrued,
    savingsUnlockTick: book.savingsUnlockTick,
    savingsPeriodsLeft: periodsLeft,
    debtPrincipal: debt.principal,
    debtArrears: debt.arrears,
    debt: creditUsed,
    creditLimit: limit,
    creditUsed,
    creditAvailable: creditFrozen ? 0 : Math.max(0, limit - creditUsed),
    creditFrozen,
    stockValue,
    commodityBidValue,
    landValue,
    factoryValue,
    inventoryValue,
    shelfValue,
    netWorth:
      cash +
      book.savingsPrincipal +
      book.savingsAccrued +
      stockValue +
      commodityBidValue +
      landValue +
      factoryValue +
      inventoryValue +
      shelfValue -
      creditUsed,
  };
}

export function nextLoanDue(loan: LoanBook): { interest: number; principal: number; total: number } {
  const interest = interestOn(loan.principal, loan.rateBps);
  const principal =
    loan.ticksRemaining <= 1 ? loan.principal : Math.min(loan.installment, loan.principal);
  return { interest, principal, total: interest + principal };
}

function shelfBookValue(state: WorldState, playerId: string): number {
  let total = 0;
  for (const shelf of state.commerce?.shelves ?? []) {
    if (state.sites[shelf.parcelId]?.ownerId !== playerId || shelf.quantity <= 0) {
      continue;
    }
    const item = ITEMS[shelf.itemId as keyof typeof ITEMS];
    if (item) {
      total += item.unitValue * shelf.quantity;
    }
  }
  return total;
}

function inventoryBookValue(stock: Readonly<Record<string, number>> | undefined): number {
  if (!stock) {
    return 0;
  }
  let total = 0;
  for (const [itemId, qty] of Object.entries(stock)) {
    if (qty <= 0) {
      continue;
    }
    const item = ITEMS[itemId as keyof typeof ITEMS];
    if (item) {
      total += item.unitValue * qty;
    }
  }
  return total;
}

function cashAfterLandTax(state: WorldState, config: WorldConfig): number {
  const player = localPlayer(state);
  if (!player) {
    return 0;
  }
  let cash = player.cash;
  for (const parcel of state.map.parcels) {
    if (parcel.ownerId !== player.id) {
      continue;
    }
    const paid = Math.min(config.landTaxPerTick, cash);
    cash -= paid;
  }
  return cash;
}

/**
 * 與「推進稅務週期」相同的結算預覽：先扣土地稅，再跑銀行週期。
 * 不分配拍賣編號，給面板顯示用。
 */
export function previewCoupledWeek(
  state: WorldState,
  config: WorldConfig = DEFAULT_WORLD_CONFIG,
): WeekPreview {
  const player = localPlayer(state);
  const before = player?.cash ?? 0;
  const afterTax = cashAfterLandTax(state, config);
  const taxed: WorldState = player
    ? {
        ...state,
        players: { ...state.players, [player.id]: { ...player, cash: afterTax } },
      }
    : state;
  const settled = settleFinancePeriod(taxed, config.bank);
  const book = getPlayerBank(settled, state.localPlayerId);
  return {
    taxPaid: before - afterTax,
    settlement: book.lastSettlement ?? ZERO_SETTLEMENT,
    cashAfter: settled.players[state.localPlayerId]?.cash ?? 0,
    financeTickAfter: settled.financeTick,
  };
}

function settleLoan(
  loan: LoanBook,
  cash: number,
): {
  loan: LoanBook | null;
  cash: number;
  interestCharged: number;
  interestPaid: number;
  principalPaid: number;
  arrearsAdded: number;
} {
  const interest = interestOn(loan.principal, loan.rateBps);
  const isFinal = loan.ticksRemaining <= 1;
  const principalDue = isFinal ? loan.principal : Math.min(loan.installment, loan.principal);
  const interestPaid = Math.min(cash, interest);
  let remaining = cash - interestPaid;
  const principalPaid = Math.min(remaining, principalDue);
  remaining -= principalPaid;

  const unpaidInterest = interest - interestPaid;
  const unpaidPrincipal = principalDue - principalPaid;
  const next: LoanBook = {
    ...loan,
    principal: loan.principal - principalDue,
    arrears: loan.arrears + unpaidInterest + unpaidPrincipal,
    ticksRemaining: Math.max(0, loan.ticksRemaining - 1),
  };
  if (next.principal === 0 && next.arrears === 0) {
    return {
      loan: null,
      cash: remaining,
      interestCharged: interest,
      interestPaid,
      principalPaid,
      arrearsAdded: unpaidInterest + unpaidPrincipal,
    };
  }
  return {
    loan: next,
    cash: remaining,
    interestCharged: interest,
    interestPaid,
    principalPaid,
    arrearsAdded: unpaidInterest + unpaidPrincipal,
  };
}

function settlePlayerBook(
  player: Player,
  book: PlayerBank,
  financeTick: number,
  config: BankConfig,
): { player: Player; bank: PlayerBank } {
  let cash = player.cash;
  let interestCharged = 0;
  let interestPaid = 0;
  let principalPaid = 0;
  let arrearsAdded = 0;
  const loans: LoanBook[] = [];

  for (const loan of book.loans) {
    const step = settleLoan(loan, cash);
    cash = step.cash;
    interestCharged += step.interestCharged;
    interestPaid += step.interestPaid;
    principalPaid += step.principalPaid;
    arrearsAdded += step.arrearsAdded;
    if (step.loan) {
      loans.push(step.loan);
    }
  }

  const idleInterest = interestOn(cash, config.idleInterestBps);
  cash += idleInterest;

  let savingsPrincipal = book.savingsPrincipal;
  let savingsAccrued = book.savingsAccrued;
  let savingsUnlockTick = book.savingsUnlockTick;
  let savingsInterest = 0;
  let savingsPayout = 0;

  if (savingsPrincipal > 0) {
    savingsInterest = interestOn(savingsPrincipal, config.savingsInterestBps);
    savingsAccrued += savingsInterest;
    if (financeTick + 1 >= savingsUnlockTick) {
      savingsPayout = savingsPrincipal + savingsAccrued;
      cash += savingsPayout;
      savingsPrincipal = 0;
      savingsAccrued = 0;
      savingsUnlockTick = 0;
    }
  }

  const lastSettlement: FinanceSettlement = {
    idleInterest,
    savingsInterest,
    savingsPayout,
    loanInterestCharged: interestCharged,
    loanInterestPaid: interestPaid,
    loanPrincipalPaid: principalPaid,
    arrearsAdded,
  };

  return {
    player: { ...player, cash },
    bank: {
      ...book,
      savingsPrincipal,
      savingsAccrued,
      savingsUnlockTick,
      loans,
      lastSettlement,
      statements: [
        {
          tick: financeTick,
          idleInterest,
          savingsInterest,
          savingsPayout,
          loanInterestCharged: interestCharged,
          loanPrincipalPaid: principalPaid,
          arrearsAdded,
        },
        ...(book.statements ?? []),
      ].slice(0, 8),
    },
  };
}

/** 只結算銀行：貸款、閒置利息、定期。不扣土地稅。 */
export function settleFinancePeriod(
  state: WorldState,
  config: BankConfig = DEFAULT_BANK_CONFIG,
): WorldState {
  let players = state.players;
  let bank = state.bank;
  for (const player of Object.values(players)) {
    const book = bank[player.id] ?? emptyPlayerBank();
    const settled = settlePlayerBook(player, book, state.financeTick, config);
    players = { ...players, [player.id]: settled.player };
    bank = { ...bank, [player.id]: settled.bank };
  }
  const ticked: WorldState = {
    ...state,
    players,
    bank,
    financeTick: state.financeTick + 1,
  };
  return matchOpenOrders(ticked);
}

function matchOpenOrders(state: WorldState): WorldState {
  const events = state.commerce?.events ?? [];
  let players = state.players;
  let bank = state.bank;
  for (const player of Object.values(players)) {
    const book = bank[player.id] ?? emptyPlayerBank();
    if ((book.orders ?? []).length === 0) {
      continue;
    }
    const filled = fillOrders(player, book, state.financeTick, events);
    players = { ...players, [player.id]: filled.player };
    bank = { ...bank, [player.id]: filled.book };
  }
  return { ...state, players, bank };
}

export function applyPlaceLimit(
  state: WorldState,
  marketId: MarketId,
  side: OrderSide,
  limitPrice: number,
  quantity: number,
): WorldState {
  const player = localPlayer(state);
  if (!player) {
    return state;
  }
  const placed = placeLimit(player, getPlayerBank(state, player.id), marketId, side, limitPrice, quantity);
  if (!placed.ok) {
    return state;
  }
  return writeBook(state, placed.player, placed.book);
}

export function applyCancelLimit(state: WorldState, orderId: string): WorldState {
  const player = localPlayer(state);
  if (!player) {
    return state;
  }
  const cancelled = cancelLimit(player, getPlayerBank(state, player.id), orderId);
  if (!cancelled.ok) {
    return state;
  }
  return writeBook(state, cancelled.player, cancelled.book);
}

export function validateOpenSavings(
  player: Player,
  book: PlayerBank,
  amount: number,
  config: BankConfig,
): BankCheck {
  if (!isPositiveInt(amount)) {
    return { ok: false, reason: '存款金額須為正整數' };
  }
  if (amount < config.savingsMinAmount) {
    return { ok: false, reason: `定期至少 $${config.savingsMinAmount.toLocaleString()}` };
  }
  if (book.savingsPrincipal > 0) {
    return { ok: false, reason: '已有一筆定期，請先解約或等待滿期' };
  }
  if (player.cash < amount) {
    return { ok: false, reason: '閒置現金不足' };
  }
  if (config.savingsTermTicks < 1) {
    return { ok: false, reason: '定期期限設定無效' };
  }
  return { ok: true };
}

export function applyOpenSavings(
  state: WorldState,
  amount: number,
  config: BankConfig = DEFAULT_BANK_CONFIG,
): WorldState {
  const player = localPlayer(state);
  if (!player) {
    return state;
  }
  const book = getPlayerBank(state, player.id);
  if (!validateOpenSavings(player, book, amount, config).ok) {
    return state;
  }
  return writeBook(
    state,
    { ...player, cash: player.cash - amount },
    {
      ...book,
      savingsPrincipal: amount,
      savingsAccrued: 0,
      savingsUnlockTick: state.financeTick + config.savingsTermTicks,
    },
  );
}

export function validateWithdrawSavings(book: PlayerBank): BankCheck {
  if (book.savingsPrincipal <= 0) {
    return { ok: false, reason: '目前沒有定期存款' };
  }
  return { ok: true };
}

export function applyWithdrawSavings(state: WorldState): WorldState {
  const player = localPlayer(state);
  if (!player) {
    return state;
  }
  const book = getPlayerBank(state, player.id);
  if (!validateWithdrawSavings(book).ok) {
    return state;
  }
  const mature = book.savingsUnlockTick > 0 && state.financeTick >= book.savingsUnlockTick;
  const payout = mature ? book.savingsPrincipal + book.savingsAccrued : book.savingsPrincipal;
  return writeBook(
    state,
    { ...player, cash: player.cash + payout },
    {
      ...book,
      savingsPrincipal: 0,
      savingsAccrued: 0,
      savingsUnlockTick: 0,
    },
  );
}

export function validateDrawLoan(
  state: WorldState,
  productId: LoanProductId,
  amount: number,
  config: BankConfig,
): BankCheck {
  const player = localPlayer(state);
  if (!player) {
    return { ok: false, reason: '找不到玩家' };
  }
  const product = LOAN_PRODUCTS[productId];
  if (!product) {
    return { ok: false, reason: '沒有這個貸款產品' };
  }
  if (!isPositiveInt(amount)) {
    return { ok: false, reason: '貸款金額須為正整數' };
  }
  if (amount < config.loanMinAmount) {
    return { ok: false, reason: `貸款至少 $${config.loanMinAmount.toLocaleString()}` };
  }
  const snapshot = summarizeBank(state, { ...DEFAULT_WORLD_CONFIG, bank: config });
  if (snapshot.creditFrozen) {
    return { ok: false, reason: '有積欠，新貸款暫停' };
  }
  if (amount > snapshot.creditAvailable) {
    return { ok: false, reason: '超過可用授信' };
  }
  return { ok: true };
}

function nextLoanId(book: PlayerBank, financeTick: number): string {
  const seq = book.loans.reduce((max, loan) => {
    const parsed = Number(loan.id.split('-')[2]);
    return Number.isFinite(parsed) ? Math.max(max, parsed) : max;
  }, 0);
  return `loan-${financeTick}-${seq + 1}`;
}

export function applyDrawLoan(
  state: WorldState,
  productId: LoanProductId,
  amount: number,
  config: BankConfig = DEFAULT_BANK_CONFIG,
): WorldState {
  const player = localPlayer(state);
  if (!player) {
    return state;
  }
  if (!validateDrawLoan(state, productId, amount, config).ok) {
    return state;
  }
  const product = LOAN_PRODUCTS[productId];
  const book = getPlayerBank(state, player.id);
  const loan: LoanBook = {
    id: nextLoanId(book, state.financeTick),
    productId,
    principal: amount,
    rateBps: product.rateBps,
    installment: Math.ceil(amount / product.termTicks),
    ticksRemaining: product.termTicks,
    arrears: 0,
  };
  return writeBook(
    state,
    { ...player, cash: player.cash + amount },
    {
      ...book,
      loans: [...book.loans, loan],
    },
  );
}

export function validateRepayLoan(state: WorldState, loanId: string, amount: number): BankCheck {
  const player = localPlayer(state);
  if (!player) {
    return { ok: false, reason: '找不到玩家' };
  }
  const book = getPlayerBank(state, player.id);
  const loan = book.loans.find((item) => item.id === loanId);
  if (!loan) {
    return { ok: false, reason: '找不到這筆貸款' };
  }
  if (!isPositiveInt(amount)) {
    return { ok: false, reason: '還款金額須為正整數' };
  }
  if (player.cash < amount) {
    return { ok: false, reason: '閒置現金不足' };
  }
  if (amount > loan.principal + loan.arrears) {
    return { ok: false, reason: '還款超過剩餘債務' };
  }
  return { ok: true };
}

export function applyRepayLoan(state: WorldState, loanId: string, amount: number): WorldState {
  const player = localPlayer(state);
  if (!player) {
    return state;
  }
  if (!validateRepayLoan(state, loanId, amount).ok) {
    return state;
  }
  const book = getPlayerBank(state, player.id);
  let left = amount;
  const loans = book.loans.flatMap((loan) => {
    if (loan.id !== loanId) {
      return [loan];
    }
    const toArrears = Math.min(loan.arrears, left);
    left -= toArrears;
    const toPrincipal = Math.min(loan.principal, left);
    left -= toPrincipal;
    const next: LoanBook = {
      ...loan,
      arrears: loan.arrears - toArrears,
      principal: loan.principal - toPrincipal,
    };
    if (next.principal === 0 && next.arrears === 0) {
      return [];
    }
    return [next];
  });
  return writeBook(state, { ...player, cash: player.cash - amount }, { ...book, loans });
}

function upsertStock(
  stocks: readonly StockHolding[],
  next: StockHolding | null,
  symbol: StockSymbol,
): StockHolding[] {
  const rest = stocks.filter((holding) => holding.symbol !== symbol);
  if (!next || next.shares <= 0) {
    return rest;
  }
  return [...rest, next];
}

export function validateBuyStock(
  state: WorldState,
  symbol: StockSymbol,
  shares: number,
): BankCheck {
  const player = localPlayer(state);
  if (!player) {
    return { ok: false, reason: '找不到玩家' };
  }
  if (!STOCKS[symbol]) {
    return { ok: false, reason: '沒有這檔股票' };
  }
  if (!isPositiveInt(shares)) {
    return { ok: false, reason: '股數須為正整數' };
  }
  const cost = quoteStock(symbol, state.financeTick) * shares;
  if (player.cash < cost) {
    return { ok: false, reason: '閒置現金不足' };
  }
  return { ok: true };
}

export function applyBuyStock(state: WorldState, symbol: StockSymbol, shares: number): WorldState {
  const player = localPlayer(state);
  if (!player || !validateBuyStock(state, symbol, shares).ok) {
    return state;
  }
  const price = quoteStock(symbol, state.financeTick);
  const cost = price * shares;
  const book = getPlayerBank(state, player.id);
  const current = book.stocks.find((holding) => holding.symbol === symbol);
  const nextShares = (current?.shares ?? 0) + shares;
  const avgCost = Math.floor(
    ((current?.shares ?? 0) * (current?.avgCost ?? 0) + cost) / nextShares,
  );
  const holding: StockHolding = { symbol, shares: nextShares, avgCost };
  return writeBook(
    state,
    { ...player, cash: player.cash - cost },
    {
      ...book,
      stocks: upsertStock(book.stocks, holding, symbol),
    },
  );
}

export function validateSellStock(
  state: WorldState,
  symbol: StockSymbol,
  shares: number,
): BankCheck {
  const player = localPlayer(state);
  if (!player) {
    return { ok: false, reason: '找不到玩家' };
  }
  if (!STOCKS[symbol]) {
    return { ok: false, reason: '沒有這檔股票' };
  }
  if (!isPositiveInt(shares)) {
    return { ok: false, reason: '股數須為正整數' };
  }
  const book = getPlayerBank(state, player.id);
  const current = book.stocks.find((holding) => holding.symbol === symbol);
  if (!current || current.shares < shares) {
    return { ok: false, reason: '持股不足' };
  }
  return { ok: true };
}

export function applySellStock(state: WorldState, symbol: StockSymbol, shares: number): WorldState {
  const player = localPlayer(state);
  if (!player || !validateSellStock(state, symbol, shares).ok) {
    return state;
  }
  const price = quoteStock(symbol, state.financeTick);
  const book = getPlayerBank(state, player.id);
  const current = book.stocks.find((holding) => holding.symbol === symbol)!;
  const nextShares = current.shares - shares;
  const holding: StockHolding | null =
    nextShares > 0 ? { symbol, shares: nextShares, avgCost: current.avgCost } : null;
  return writeBook(
    state,
    { ...player, cash: player.cash + price * shares },
    {
      ...book,
      stocks: upsertStock(book.stocks, holding, symbol),
    },
  );
}

function upsertCommodity(
  holdings: readonly CommodityHolding[],
  next: CommodityHolding | null,
  commodityId: CommodityId,
): CommodityHolding[] {
  const rest = holdings.filter((holding) => holding.commodityId !== commodityId);
  if (!next || next.units <= 0) {
    return rest;
  }
  return [...rest, next];
}

export function validateBuyCommodity(
  state: WorldState,
  commodityId: CommodityId,
  lots: number,
): BankCheck {
  const player = localPlayer(state);
  if (!player) {
    return { ok: false, reason: '找不到玩家' };
  }
  const def = COMMODITIES[commodityId];
  if (!def) {
    return { ok: false, reason: '沒有這個商品' };
  }
  if (!isPositiveInt(lots)) {
    return { ok: false, reason: '手數須為正整數' };
  }
  const ask = quoteCommodityAsk(commodityId, state.financeTick);
  const cost = ask * def.lotSize * lots;
  if (player.cash < cost) {
    return { ok: false, reason: '閒置現金不足' };
  }
  return { ok: true };
}

export function applyBuyCommodity(
  state: WorldState,
  commodityId: CommodityId,
  lots: number,
): WorldState {
  const player = localPlayer(state);
  if (!player || !validateBuyCommodity(state, commodityId, lots).ok) {
    return state;
  }
  const def = COMMODITIES[commodityId];
  const ask = quoteCommodityAsk(commodityId, state.financeTick);
  const units = def.lotSize * lots;
  const cost = ask * units;
  const book = getPlayerBank(state, player.id);
  const current = book.commodities.find((holding) => holding.commodityId === commodityId);
  const nextUnits = (current?.units ?? 0) + units;
  const avgCost = Math.floor(((current?.units ?? 0) * (current?.avgCost ?? 0) + cost) / nextUnits);
  const holding: CommodityHolding = { commodityId, units: nextUnits, avgCost };
  return writeBook(
    state,
    { ...player, cash: player.cash - cost },
    {
      ...book,
      commodities: upsertCommodity(book.commodities, holding, commodityId),
    },
  );
}

export function validateSellCommodity(
  state: WorldState,
  commodityId: CommodityId,
  lots: number,
): BankCheck {
  const player = localPlayer(state);
  if (!player) {
    return { ok: false, reason: '找不到玩家' };
  }
  const def = COMMODITIES[commodityId];
  if (!def) {
    return { ok: false, reason: '沒有這個商品' };
  }
  if (!isPositiveInt(lots)) {
    return { ok: false, reason: '手數須為正整數' };
  }
  const book = getPlayerBank(state, player.id);
  const current = book.commodities.find((holding) => holding.commodityId === commodityId);
  if (!current || current.units < def.lotSize * lots) {
    return { ok: false, reason: '庫存不足' };
  }
  return { ok: true };
}

export function applySellCommodity(
  state: WorldState,
  commodityId: CommodityId,
  lots: number,
  config: BankConfig = DEFAULT_BANK_CONFIG,
): WorldState {
  const player = localPlayer(state);
  if (!player || !validateSellCommodity(state, commodityId, lots).ok) {
    return state;
  }
  const def = COMMODITIES[commodityId];
  const ask = quoteCommodityAsk(commodityId, state.financeTick);
  const bid = quoteCommodityBid(ask, config.commoditySpreadBps);
  const units = def.lotSize * lots;
  const book = getPlayerBank(state, player.id);
  const current = book.commodities.find((holding) => holding.commodityId === commodityId)!;
  const nextUnits = current.units - units;
  const holding: CommodityHolding | null =
    nextUnits > 0 ? { commodityId, units: nextUnits, avgCost: current.avgCost } : null;
  return writeBook(
    state,
    { ...player, cash: player.cash + bid * units },
    {
      ...book,
      commodities: upsertCommodity(book.commodities, holding, commodityId),
    },
  );
}
