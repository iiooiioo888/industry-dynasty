import {
  denseZoneAt,
  findParcel,
  getItemQty,
  getPlayerHoldings,
  getPlayerInventory,
  listCityOrders,
  quoteLocalDemand,
  roadNamesAt,
  type ParcelId,
  type WorldState,
} from '@industry-dynasty/sim';
import { ArtSlot } from '../art/ArtSlot';
import '../art/art.css';
import './MarketPanel.css';

export interface MarketPanelProps {
  state: WorldState;
  selectedParcelId: ParcelId | null;
  onFillOrder: (orderId: string, quantity: number, parcelId: ParcelId) => void;
}

export function MarketPanel({ state, selectedParcelId, onFillOrder }: MarketPanelProps) {
  const parcel = selectedParcelId ? findParcel(state, selectedParcelId) : undefined;
  const holdings = getPlayerHoldings(state, state.localPlayerId);
  const shipFrom =
    holdings.find((entry) => entry.id.value === selectedParcelId?.value) ?? holdings[0];
  const stock = getPlayerInventory(state, state.localPlayerId);
  const orders = listCityOrders(state);

  if (!parcel) {
    return (
      <section className="sys-panel market-panel">
        <header className="market-head">
          <ArtSlot slot="uiMarketHub" className="market-hub-art" />
          <h2>在地市場</h2>
        </header>
        <p className="panel-muted">點一格地</p>
        <CityOrders orders={orders} shipFrom={shipFrom} stock={stock} onFillOrder={onFillOrder} />
      </section>
    );
  }

  const quote = quoteLocalDemand(parcel);
  const zone = denseZoneAt(state.map, parcel.x, parcel.y);
  const roads = roadNamesAt(state.map, parcel.x, parcel.y);
  const place =
    parcel.role === 'city-hub'
      ? (parcel.nearestCityName ?? '城市據點')
      : parcel.role === 'road'
        ? (roads[0] ?? '道路')
        : zone
          ? zone.name
          : parcel.nearestCityName
            ? `近${parcel.nearestCityName}`
            : '鄉野';

  return (
    <section className="sys-panel market-panel">
      <header className="market-head">
        <ArtSlot slot="uiMarketHub" className="market-hub-art" />
        <div>
          <h2>在地市場</h2>
          <p className="market-place">
            {place} · ({parcel.x}, {parcel.y})
          </p>
        </div>
      </header>
      {parcel.role === 'city-hub' || parcel.role === 'road' ? (
        <p className="panel-muted">{parcel.role === 'road' ? '道路' : '城市'}不出售</p>
      ) : null}
      <dl className="market-stats">
        <div>
          <dt>人口</dt>
          <dd>{parcel.populationDensity}</dd>
        </div>
        <div>
          <dt>週量</dt>
          <dd>{quote.weeklyVolume}</dd>
        </div>
        <div>
          <dt>單價</dt>
          <dd>${quote.unitPrice.toLocaleString()}</dd>
        </div>
      </dl>
      <CityOrders orders={orders} shipFrom={shipFrom} stock={stock} onFillOrder={onFillOrder} />
    </section>
  );
}

function CityOrders({
  orders,
  shipFrom,
  stock,
  onFillOrder,
}: {
  orders: ReturnType<typeof listCityOrders>;
  shipFrom: ReturnType<typeof findParcel>;
  stock: ReturnType<typeof getPlayerInventory>;
  onFillOrder: MarketPanelProps['onFillOrder'];
}) {
  return (
    <div className="city-orders">
      <h3>城市供貨</h3>
      <ul className="floor-actions">
        {orders.map((order) => {
          const have = getItemQty(stock, order.itemId);
          const room = order.quantity - order.filled;
          const qty = Math.min(room, have);
          return (
            <li key={order.id}>
              <span>
                {order.cityName} · {order.nameZh} 剩 {room} · ${order.unitPay.toLocaleString()}
              </span>
              <button
                type="button"
                disabled={!shipFrom || qty <= 0}
                onClick={() => {
                  if (shipFrom) {
                    onFillOrder(order.id, qty, shipFrom.id);
                  }
                }}
              >
                {room <= 0 ? '已交' : '交貨'}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
