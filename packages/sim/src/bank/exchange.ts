import type { WorldEvent } from '../commerce/types.js';
import { COMMODITIES, STOCK_LIST, STOCKS } from './catalog.js';
import { DEFAULT_BANK_CONFIG } from './config.js';
import { quoteCommodityAsk, quoteCommodityBid, quoteStock } from './quotes.js';
import type {
  CommodityHolding,
  CommodityId,
  LimitOrder,
  MarketFill,
  MarketId,
  OrderSide,
  PlayerBank,
  StockHolding,
  StockSymbol,
} from './types.js';
import type { Player } from '../world/state.js';

const STOCK_SPREAD_BPS = 50;

export interface BoardQuote {
  readonly marketId: MarketId;
  readonly kind: 'stock' | 'commodity';
  readonly nameZh: string;
  readonly bid: number;
  readonly ask: number;
  readonly mid: number;
  readonly previousMid: number;
  readonly delta: number;
  readonly volume: number;
  /** 一手對應的單位數。股票為 1。 */
  readonly unit: number;
}

export interface IndexQuote {
  readonly level: number;
  readonly previous: number;
  readonly delta: number;
}

function isStock(marketId: string): marketId is StockSymbol {
  return marketId in STOCKS;
}

function eventFactor(marketId: MarketId, events: readonly WorldEvent[]): number {
  let factor = 1;
  for (const event of events) {
    if (event.kind === 'freight-up' && marketId === 'PORT') {
      factor *= 1.04;
    }
    if (event.kind === 'port-raw-down' && (marketId === 'coal' || marketId === 'copper')) {
      factor *= 0.96;
    }
    if (event.kind === 'city-demand-up' && marketId === 'TOOL') {
      factor *= 1.03;
    }
  }
  return factor;
}

function scaled(price: number, factor: number): number {
  return Math.max(1, Math.round(price * factor));
}

export function quoteBoard(
  marketId: MarketId,
  tick: number,
  events: readonly WorldEvent[] = [],
): BoardQuote {
  const factor = eventFactor(marketId, events);
  const previousTick = Math.max(0, tick - 1);
  if (isStock(marketId)) {
    const mid = scaled(quoteStock(marketId, tick), factor);
    const previousMid = scaled(quoteStock(marketId, previousTick), factor);
    const bid = Math.max(1, Math.floor((mid * (10_000 - STOCK_SPREAD_BPS)) / 10_000));
    const ask = Math.max(bid, Math.ceil((mid * (10_000 + STOCK_SPREAD_BPS)) / 10_000));
    return {
      marketId,
      kind: 'stock',
      nameZh: STOCKS[marketId].nameZh,
      bid,
      ask,
      mid,
      previousMid,
      delta: mid - previousMid,
      volume: printedVolume(marketId, tick),
      unit: 1,
    };
  }
  const commodityId = marketId as CommodityId;
  const ask = scaled(quoteCommodityAsk(commodityId, tick), factor);
  const bid = quoteCommodityBid(ask, DEFAULT_BANK_CONFIG.commoditySpreadBps);
  const previousAsk = scaled(quoteCommodityAsk(commodityId, previousTick), factor);
  return {
    marketId,
    kind: 'commodity',
    nameZh: COMMODITIES[commodityId].nameZh,
    bid,
    ask,
    mid: ask,
    previousMid: previousAsk,
    delta: ask - previousAsk,
    volume: printedVolume(marketId, tick),
    unit: COMMODITIES[commodityId].lotSize,
  };
}

export function listBoard(tick: number, events: readonly WorldEvent[] = []): readonly BoardQuote[] {
  return [
    ...STOCK_LIST.map((stock) => quoteBoard(stock.symbol, tick, events)),
    ...(['copper', 'coal', 'yarn', 'steel'] as const).map((id) => quoteBoard(id, tick, events)),
  ];
}

export function quoteIndex(tick: number): IndexQuote {
  const level = indexLevel(tick);
  const previous = tick <= 0 ? level : indexLevel(tick - 1);
  return { level, previous, delta: level - previous };
}

export function indexSeries(tick: number): readonly number[] {
  const start = Math.max(0, tick - 7);
  const levels: number[] = [];
  for (let step = start; step <= tick; step += 1) {
    levels.push(indexLevel(step));
  }
  return levels;
}

export interface ChartPoint {
  readonly tick: number;
  readonly value: number;
  readonly volume: number;
}

const CHART_POINTS = 32;

/** 已印出的報價。窗口最長 32 期，終點是本期，不包含下一期。 */
export function marketSeries(
  marketId: MarketId,
  tick: number,
  events: readonly WorldEvent[] = [],
): readonly ChartPoint[] {
  return chartWindow(tick).map((step) => {
    const quote = quoteBoard(marketId, step, step === safeTick(tick) ? events : []);
    return { tick: step, value: quote.mid, volume: quote.volume };
  });
}

export function indexHistory(tick: number): readonly ChartPoint[] {
  return chartWindow(tick).map((step) => ({
    tick: step,
    value: indexLevel(step),
    volume: STOCK_LIST.reduce((sum, stock) => sum + printedVolume(stock.symbol, step), 0),
  }));
}

function safeTick(tick: number): number {
  if (!Number.isFinite(tick)) {
    return 0;
  }
  return Math.max(0, Math.floor(tick));
}

function chartWindow(tick: number): number[] {
  const end = safeTick(tick);
  const start = Math.max(0, end - (CHART_POINTS - 1));
  const steps: number[] = [];
  for (let step = start; step <= end; step += 1) {
    steps.push(step);
  }
  return steps;
}

function indexLevel(tick: number): number {
  const now = STOCK_LIST.reduce((sum, stock) => sum + quoteStock(stock.symbol, tick), 0);
  const base = STOCK_LIST.reduce((sum, stock) => sum + stock.basePrice, 0);
  return Math.round((now / base) * 1000);
}

function printedVolume(marketId: string, tick: number): number {
  let hash = 0;
  for (const char of marketId) {
    hash = (hash * 33 + char.charCodeAt(0)) % 97;
  }
  return 20 + ((tick * 13 + hash) % 80);
}

export interface OrderResult {
  readonly ok: boolean;
  readonly reason?: string;
  readonly player: Player;
  readonly book: PlayerBank;
}

export function placeLimit(
  player: Player,
  book: PlayerBank,
  marketId: MarketId,
  side: OrderSide,
  limitPrice: number,
  quantity: number,
): OrderResult {
  const fail = (reason: string): OrderResult => ({ ok: false, reason, player, book });
  if (!isListed(marketId)) {
    return fail('沒有這個標的');
  }
  if (!Number.isInteger(limitPrice) || limitPrice <= 0) {
    return fail('限價須為正整數');
  }
  if (!Number.isInteger(quantity) || quantity <= 0) {
    return fail('數量須為正整數');
  }
  const orders = book.orders ?? [];
  if (orders.length >= 12) {
    return fail('掛單已滿');
  }
  const unit = quoteBoard(marketId, 0).unit;
  if (side === 'buy') {
    const escrow = limitPrice * unit * quantity;
    if (player.cash < escrow) {
      return fail('閒置現金不足');
    }
    const order: LimitOrder = {
      id: `ord-${book.fills?.length ?? 0}-${orders.length}-${marketId}`,
      marketId,
      side,
      limitPrice,
      quantity,
      escrow,
    };
    return {
      ok: true,
      player: { ...player, cash: player.cash - escrow },
      book: { ...book, orders: [...orders, order] },
    };
  }
  if (freeToSell(book, marketId) < quantity) {
    return fail('可賣數量不足');
  }
  const order: LimitOrder = {
    id: `ord-${book.fills?.length ?? 0}-${orders.length}-${marketId}-s`,
    marketId,
    side,
    limitPrice,
    quantity,
    escrow: 0,
  };
  return { ok: true, player, book: { ...book, orders: [...orders, order] } };
}

export function cancelLimit(player: Player, book: PlayerBank, orderId: string): OrderResult {
  const orders = book.orders ?? [];
  const order = orders.find((item) => item.id === orderId);
  if (!order) {
    return { ok: false, reason: '找不到掛單', player, book };
  }
  return {
    ok: true,
    player: { ...player, cash: player.cash + order.escrow },
    book: { ...book, orders: orders.filter((item) => item.id !== orderId) },
  };
}

export function fillOrders(
  player: Player,
  book: PlayerBank,
  tick: number,
  events: readonly WorldEvent[],
): { player: Player; book: PlayerBank } {
  let cash = player.cash;
  let stocks = book.stocks;
  let commodities = book.commodities;
  const resting: LimitOrder[] = [];
  const fills = [...(book.fills ?? [])];
  for (const order of book.orders ?? []) {
    const quote = quoteBoard(order.marketId, tick, events);
    const buyCross = order.side === 'buy' && quote.ask <= order.limitPrice;
    const sellCross = order.side === 'sell' && quote.bid >= order.limitPrice;
    if (!buyCross && !sellCross) {
      resting.push(order);
      continue;
    }
    if (order.side === 'buy') {
      const pay = quote.ask * quote.unit * order.quantity;
      if (pay > order.escrow) {
        resting.push(order);
        continue;
      }
      cash += order.escrow - pay;
      if (quote.kind === 'stock') {
        stocks = addShares(stocks, order.marketId as StockSymbol, order.quantity, pay);
      } else {
        commodities = addUnits(
          commodities,
          order.marketId as CommodityId,
          quote.unit * order.quantity,
          pay,
        );
      }
      fills.unshift(fillOf(tick, order, quote.ask, -pay));
      continue;
    }
    const proceeds = quote.bid * quote.unit * order.quantity;
    if (quote.kind === 'stock') {
      const next = removeShares(stocks, order.marketId as StockSymbol, order.quantity);
      if (!next) {
        resting.push(order);
        continue;
      }
      stocks = next;
    } else {
      const next = removeUnits(
        commodities,
        order.marketId as CommodityId,
        quote.unit * order.quantity,
      );
      if (!next) {
        resting.push(order);
        continue;
      }
      commodities = next;
    }
    cash += proceeds;
    fills.unshift(fillOf(tick, order, quote.bid, proceeds));
  }
  return {
    player: { ...player, cash },
    book: { ...book, stocks, commodities, orders: resting, fills: fills.slice(0, 12) },
  };
}

function fillOf(tick: number, order: LimitOrder, price: number, cash: number): MarketFill {
  return {
    id: `fill-${tick}-${order.id}`,
    tick,
    marketId: order.marketId,
    side: order.side,
    quantity: order.quantity,
    price,
    cash,
  };
}

function isListed(marketId: string): marketId is MarketId {
  return marketId in STOCKS || marketId in COMMODITIES;
}

export function freeToSell(book: PlayerBank, marketId: MarketId): number {
  const reserved = (book.orders ?? [])
    .filter((order) => order.marketId === marketId && order.side === 'sell')
    .reduce((sum, order) => sum + order.quantity, 0);
  if (isStock(marketId)) {
    const shares = book.stocks.find((holding) => holding.symbol === marketId)?.shares ?? 0;
    return Math.max(0, shares - reserved);
  }
  const lot = COMMODITIES[marketId as CommodityId].lotSize;
  const units = book.commodities.find((holding) => holding.commodityId === marketId)?.units ?? 0;
  return Math.max(0, Math.floor(units / lot) - reserved);
}

function addShares(
  stocks: readonly StockHolding[],
  symbol: StockSymbol,
  shares: number,
  cost: number,
): StockHolding[] {
  const current = stocks.find((holding) => holding.symbol === symbol);
  const nextShares = (current?.shares ?? 0) + shares;
  const avgCost = Math.floor(
    ((current?.shares ?? 0) * (current?.avgCost ?? 0) + cost) / nextShares,
  );
  return [
    ...stocks.filter((holding) => holding.symbol !== symbol),
    { symbol, shares: nextShares, avgCost },
  ];
}

function removeShares(
  stocks: readonly StockHolding[],
  symbol: StockSymbol,
  shares: number,
): StockHolding[] | null {
  const current = stocks.find((holding) => holding.symbol === symbol);
  if (!current || current.shares < shares) {
    return null;
  }
  const nextShares = current.shares - shares;
  const rest = stocks.filter((holding) => holding.symbol !== symbol);
  return nextShares > 0 ? [...rest, { ...current, shares: nextShares }] : rest;
}

function addUnits(
  holdings: readonly CommodityHolding[],
  commodityId: CommodityId,
  units: number,
  cost: number,
): CommodityHolding[] {
  const current = holdings.find((holding) => holding.commodityId === commodityId);
  const nextUnits = (current?.units ?? 0) + units;
  const avgCost = Math.floor(((current?.units ?? 0) * (current?.avgCost ?? 0) + cost) / nextUnits);
  return [
    ...holdings.filter((holding) => holding.commodityId !== commodityId),
    { commodityId, units: nextUnits, avgCost },
  ];
}

function removeUnits(
  holdings: readonly CommodityHolding[],
  commodityId: CommodityId,
  units: number,
): CommodityHolding[] | null {
  const current = holdings.find((holding) => holding.commodityId === commodityId);
  if (!current || current.units < units) {
    return null;
  }
  const nextUnits = current.units - units;
  const rest = holdings.filter((holding) => holding.commodityId !== commodityId);
  return nextUnits > 0 ? [...rest, { ...current, units: nextUnits }] : rest;
}
