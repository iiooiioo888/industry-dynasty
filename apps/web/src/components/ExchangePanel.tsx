import {
  freeToSell,
  getPlayerBank,
  indexSeries,
  listBoard,
  quoteIndex,
  readCommerce,
  type MarketId,
  type WorldState,
} from '@industry-dynasty/sim';
import { useState } from 'react';
import './ExchangePanel.css';

function money(amount: number): string {
  return `$${amount.toLocaleString()}`;
}

export interface ExchangePanelProps {
  state: WorldState;
  onPlace: (marketId: MarketId, side: 'buy' | 'sell', limitPrice: number, quantity: number) => void;
  onCancel: (orderId: string) => void;
}

export function ExchangePanel({ state, onPlace, onCancel }: ExchangePanelProps) {
  const events = readCommerce(state).events;
  const board = listBoard(state.financeTick, events);
  const index = quoteIndex(state.financeTick);
  const series = indexSeries(state.financeTick);
  const book = getPlayerBank(state, state.localPlayerId);
  const [marketId, setMarketId] = useState<MarketId>('IRON');
  const selected = board.find((row) => row.marketId === marketId) ?? board[0];
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
          指數 {index.level} {index.delta > 0 ? '▲' : index.delta < 0 ? '▼' : '–'} {Math.abs(index.delta)}
        </p>
      </header>
      <IndexLine levels={series} />
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
              }}
            >
              <td>
                {row.nameZh}
                <small>{row.marketId}</small>
              </td>
              <td>{money(row.bid)}</td>
              <td>{money(row.ask)}</td>
              <td className={row.delta > 0 ? 'quote-rise' : row.delta < 0 ? 'quote-fall' : undefined}>
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
                    {order.side === 'buy' ? '買' : '賣'} {order.marketId} {money(order.limitPrice)} ×{' '}
                    {order.quantity}
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
                  第 {fill.tick} 期 {fill.side === 'buy' ? '買' : '賣'} {fill.marketId} {money(fill.price)} ×{' '}
                  {fill.quantity}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}

function IndexLine({ levels }: { levels: readonly number[] }) {
  const width = 280;
  const height = 36;
  const min = Math.min(...levels);
  const max = Math.max(...levels);
  const span = max - min || 1;
  const points = levels
    .map((level, index) => {
      const x = levels.length === 1 ? 4 : (index / (levels.length - 1)) * (width - 8) + 4;
      const y = height - 4 - ((level - min) / span) * (height - 10);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg className="index-line" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}
