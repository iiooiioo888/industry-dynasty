import { COMMODITIES, STOCKS } from './catalog.js';
import type { CommodityId, StockSymbol } from './types.js';

export function interestOn(amount: number, bps: number): number {
  if (amount <= 0 || bps <= 0) {
    return 0;
  }
  return Math.floor((amount * bps) / 10_000);
}

export function formatBps(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

export function priceFromWave(basePrice: number, waveBps: readonly number[], tick: number): number {
  const index = ((tick % waveBps.length) + waveBps.length) % waveBps.length;
  const bps = waveBps[index] ?? 0;
  return Math.max(1, Math.round((basePrice * (10_000 + bps)) / 10_000));
}

export function quoteStock(symbol: StockSymbol, tick: number): number {
  const def = STOCKS[symbol];
  return priceFromWave(def.basePrice, def.waveBps, tick);
}

export function quoteStockMove(
  symbol: StockSymbol,
  tick: number,
): { price: number; previous: number; delta: number } {
  const price = quoteStock(symbol, tick);
  const previous = tick <= 0 ? price : quoteStock(symbol, tick - 1);
  return { price, previous, delta: price - previous };
}

export function quoteCommodityAsk(commodityId: CommodityId, tick: number): number {
  const def = COMMODITIES[commodityId];
  return priceFromWave(def.basePrice, def.waveBps, tick);
}

export function quoteCommodityBid(ask: number, spreadBps: number): number {
  const kept = Math.max(0, 10_000 - spreadBps);
  return Math.max(1, Math.floor((ask * kept) / 10_000));
}
