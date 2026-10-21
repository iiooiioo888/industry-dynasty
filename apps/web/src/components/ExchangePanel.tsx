import {
  BOND_LIST,
  formatBps,
  freeToSell,
  getPlayerBank,
  indexHistory,
  listBoard,
  marketSeries,
  quoteBond,
  quoteIndex,
  quoteRates,
  readCommerce,
  type BondId,
  type MarketId,
  type WorldState,
} from '@industry-dynasty/sim';
import { useState } from 'react';
import { MarketChart } from './MarketChart';
import './ExchangePanel.css';

function money(amount: number): string {
  return `$${amount.toLocaleString()}`;
}

export interface ExchangePanelProps {
  state: WorldState;
  onPlace: (marketId: MarketId, side: 'buy' | 'sell', limitPrice: number, quantity: number) => void;
  onCancel: (orderId: string) => void;
  onBuyBond: (bondId: BondId, units: number) => void;
  onSellBond: (bondId: BondId, units: number) => void;
}

export function ExchangePanel({
  state,
  onPlace,
  onCancel,
  onBuyBond,
  onSellBond,
}: ExchangePanelProps) {
  const events = readCommerce(state).events;
  const board = listBoard(state.financeTick, events);
  const rates = quoteRates(state.financeTick);
  const index = quoteIndex(state.financeTick);
  const book = getPlayerBank(state, state.localPlayerId);
  const [marketId, setMarketId] = useState<MarketId>('IRON');
  const [chartKind, setChartKind] = useState<'index' | 'market'>('market');
  const selected = board.find((row) => row.marketId === marketId) ?? board[0];
  const chartPoints =
    chartKind === 'index' || !selected
      ? indexHistory(state.financeTick)
      : marketSeries(selected.marketId, state.financeTick, events);
  const [limitPrice, setLimitPrice] = useState(selected?.ask ?? 1);
  const [quantity, setQuantity] = useState(1);
  const holdingShares =
    selected?.kind === 'stock'
      ? (book.stocks.find((item) => item.symbol === selected.marketId)?.shares ?? 0)
      : (book.commodities.find((item) => item.commodityId === selected?.marketId)?.units ?? 0);

  return (
    <section className="sys-panel exchange-panel page-span">
      <header className="sys-panel-head">
        <span className="sys-panel-tag">MKT</span>
        <h2>金融</h2>
        <p className={index.delta > 0 ? 'quote-rise' : index.delta < 0 ? 'quote-fall' : undefined}>
          指數 {index.level} {index.delta > 0 ? '▲' : index.delta < 0 ? '▼' : '–'}{' '}
          {Math.abs(index.delta)}
        </p>
      </header>
      <dl className="rate-strip">
        <div>
          <dt>政策</dt>
          <dd>{formatBps(rates.policyAnnualBps)}</dd>
        </div>
        <div>
          <dt>通膨</dt>
          <dd>{formatBps(rates.inflationAnnualBps)}</dd>
        </div>
        <div>
          <dt>實質</dt>
          <dd>{formatBps(rates.realAnnualBps)}</dd>
        </div>
        <div>
          <dt>隔夜</dt>
          <dd>{formatBps(rates.idleBps)}</dd>
        </div>
        <div>
          <dt>定期</dt>
          <dd>{formatBps(rates.savingsBps)}</dd>
        </div>
        <div>
          <dt>短債</dt>
          <dd>{formatBps(rates.billBps)}</dd>
        </div>
        <div>
          <dt>長債</dt>
          <dd>{formatBps(rates.longBps)}</dd>
        </div>
      </dl>
      <MarketChart
        name={chartKind === 'index' || !selected ? '產業指數' : selected.nameZh}
        code={chartKind === 'index' || !selected ? 'INDEX' : selected.marketId}
        points={chartPoints}
        delta={chartKind === 'index' || !selected ? index.delta : selected.delta}
      />
      <div className="chart-switch" role="tablist" aria-label="圖表">
        <button
          type="button"
          role="tab"
          aria-selected={chartKind === 'market'}
          onClick={() => setChartKind('market')}
        >
          {selected?.nameZh ?? '標的'}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={chartKind === 'index'}
          onClick={() => setChartKind('index')}
        >
          指數
        </button>
      </div>
      <table className="exchange-board">
        <thead>
          <tr>
            <th>標的</th>
            <th>買價</th>
            <th>賣價</th>
            <th>漲跌</th>
            <th>量</th>
          </tr>
        </thead>
        <tbody>
          {board.map((row) => (
            <tr
              key={row.marketId}
              className={row.marketId === selected?.marketId ? 'is-on' : undefined}
              onClick={() => {
                setMarketId(row.marketId);
                setLimitPrice(row.ask);
                setChartKind('market');
              }}
            >
              <td>
                {row.nameZh}
                <small>{row.marketId}</small>
              </td>
              <td>{money(row.bid)}</td>
              <td>{money(row.ask)}</td>
              <td
                className={row.delta > 0 ? 'quote-rise' : row.delta < 0 ? 'quote-fall' : undefined}
              >
                {row.delta > 0 ? '+' : ''}
                {row.delta}
              </td>
              <td>{row.volume}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {selected ? (
        <div className="exchange-ticket">
          <strong>
            {selected.nameZh} · 持有 {holdingShares}
            {selected.kind === 'commodity' ? `（${selected.unit}/手）` : ''} · 可賣{' '}
            {freeToSell(book, selected.marketId)}
          </strong>
          <label>
            限價
            <input
              type="number"
              min={1}
              value={limitPrice}
              onChange={(event) => setLimitPrice(Number(event.target.value))}
            />
          </label>
          <label>
            {selected.kind === 'stock' ? '股' : '手'}
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(event) => setQuantity(Number(event.target.value))}
            />
          </label>
          <button
            type="button"
            onClick={() => onPlace(selected.marketId, 'buy', Math.round(limitPrice), quantity)}
          >
            買 {money(Math.round(limitPrice) * selected.unit * quantity)}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => onPlace(selected.marketId, 'sell', Math.round(limitPrice), quantity)}
          >
            賣
          </button>
        </div>
      ) : null}
      <table className="exchange-board">
        <thead>
          <tr>
            <th>債券</th>
            <th>殖利率</th>
            <th>價格</th>
            <th>剩餘</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {BOND_LIST.map((bond) => {
            const quote = quoteBond(bond.id, state.financeTick);
            const owned = (book.bonds ?? [])
              .filter((holding) => holding.bondId === bond.id)
              .reduce((sum, holding) => sum + holding.units, 0);
            return (
              <tr key={bond.id}>
                <td>
                  {bond.nameZh}
                  <small>{owned > 0 ? `${owned} 張` : bond.id}</small>
                </td>
                <td>{formatBps(quote.yieldBps)}</td>
                <td>{money(quote.price)}</td>
                <td>{quote.periodsLeft}</td>
                <td>
                  <button type="button" onClick={() => onBuyBond(bond.id, 1)}>
                    買
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    disabled={owned < 1}
                    onClick={() => onSellBond(bond.id, 1)}
                  >
                    賣
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="exchange-books">
        <div>
          <h3>掛單</h3>
          {(book.orders ?? []).length === 0 ? (
            <p className="sys-muted">—</p>
          ) : (
            <ul>
              {book.orders.map((order) => (
                <li key={order.id}>
                  <span>
                    {order.side === 'buy' ? '買' : '賣'} {order.marketId} {money(order.limitPrice)}{' '}
                    × {order.quantity}
                  </span>
                  <button type="button" onClick={() => onCancel(order.id)}>
                    撤
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <h3>成交</h3>
          {(book.fills ?? []).length === 0 ? (
            <p className="sys-muted">—</p>
          ) : (
            <ul>
              {book.fills.map((fill) => (
                <li key={fill.id}>
                  第 {fill.tick} 期 {fill.side === 'buy' ? '買' : '賣'} {fill.marketId}{' '}
                  {money(fill.price)} × {fill.quantity}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
