import {
  CONSUMER_ITEM_IDS,
  findParcel,
  getItemQty,
  getPlayerHoldings,
  getPlayerInventory,
  ITEMS,
  listShipmentViews,
  MARKET_HUB,
  manhattanToMarket,
  quoteRetailDay,
  quoteSale,
  readCommerce,
  type ItemId,
  type ParcelId,
  type WorldState,
} from '@industry-dynasty/sim';
import { useEffect, useMemo, useState } from 'react';
import { ASSET_SLOTS, MAP_ART_SLOT } from '../assets/slots';
import './SalesPanel.css';

export interface SalesPanelProps {
  state: WorldState;
  selectedParcelId: ParcelId | null;
  onSell: (offerId: string, quantity: number, shipFromParcelId: ParcelId) => void;
  onSetShelf: (parcelId: ParcelId, itemId: ItemId, unitPrice: number, quantity: number) => void;
  onAcceptContract: (contractId: string, shipFromParcelId: ParcelId) => void;
}

type SalesTab = 'port' | 'shelf' | 'contract';

function salesDisabledReason(
  state: WorldState,
  offerId: string,
  qty: number,
  shipParcel: ReturnType<typeof findParcel>,
): string | null {
  const playerId = state.localPlayerId;
  const holdings = getPlayerHoldings(state, playerId);
  if (holdings.length === 0) {
    return `尚未擁有土地，無法出貨至港區 (${MARKET_HUB.x},${MARKET_HUB.y})。`;
  }
  const offer = state.npcBuyOffers.find((o) => o.id === offerId);
  if (!offer) {
    return '請選擇收購項目。';
  }
  const stock = getPlayerInventory(state, playerId);
  if (getItemQty(stock, offer.itemId) < qty || qty <= 0) {
    return `庫存不足（目前 ${getItemQty(stock, offer.itemId)}，欲售 ${qty}）。`;
  }
  if (!shipParcel) {
    return '請從下拉選擇出貨點。';
  }
  const quote = quoteSale(offer, shipParcel);
  if (quote.netPerUnit <= 0) {
    return `運輸 $${quote.transportPerUnit}/單 高於港價 $${quote.hubUnitPrice}；請購買更靠近市場的土地，或改賣高價品。`;
  }
  return null;
}

export function SalesPanel({
  state,
  selectedParcelId,
  onSell,
  onSetShelf,
  onAcceptContract,
}: SalesPanelProps) {
  const [tab, setTab] = useState<SalesTab>('port');

  return (
    <section className="sys-panel sales-panel">
      <header className="sys-panel-head">
        <span className="sys-panel-tag">SAL</span>
        <h2>銷售</h2>
      </header>
      <div className="sales-tabs" role="tablist">
        {(
          [
            ['port', '港區現貨'],
            ['shelf', '門市上架'],
            ['contract', '城市合約'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? 'sales-tab is-on' : 'sales-tab'}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'port' ? (
        <PortSale state={state} selectedParcelId={selectedParcelId} onSell={onSell} />
      ) : null}
      {tab === 'shelf' ? (
        <ShelfSale state={state} selectedParcelId={selectedParcelId} onSetShelf={onSetShelf} />
      ) : null}
      {tab === 'contract' ? (
        <ContractSale
          state={state}
          selectedParcelId={selectedParcelId}
          onAcceptContract={onAcceptContract}
        />
      ) : null}
    </section>
  );
}

function PortSale({
  state,
  selectedParcelId,
  onSell,
}: {
  state: WorldState;
  selectedParcelId: ParcelId | null;
  onSell: SalesPanelProps['onSell'];
}) {
  const player = state.players[state.localPlayerId];
  const stock = getPlayerInventory(state, player.id);
  const holdings = getPlayerHoldings(state, player.id);
  const preferred = selectedParcelId ? findParcel(state, selectedParcelId) : undefined;

  const [offerId, setOfferId] = useState(state.npcBuyOffers[0]?.id ?? '');
  const [qty, setQty] = useState(1);
  const [shipKey, setShipKey] = useState('');

  useEffect(() => {
    if (!state.npcBuyOffers.some((o) => o.id === offerId)) {
      setOfferId(state.npcBuyOffers[0]?.id ?? '');
    }
  }, [state.npcBuyOffers, offerId]);

  const holdingKey = holdings.map((parcel) => parcel.id.value).join('|');

  useEffect(() => {
    if (preferred?.ownerId === player.id) {
      setShipKey(preferred.id.value);
    }
  }, [preferred?.id.value, preferred?.ownerId, player.id]);

  useEffect(() => {
    if (shipKey && !holdingKey.split('|').includes(shipKey)) {
      setShipKey('');
    }
  }, [shipKey, holdingKey]);

  const shipParcel = holdings.find((parcel) => parcel.id.value === shipKey);
  const shipments = listShipmentViews(state);
  const offer = state.npcBuyOffers.find((o) => o.id === offerId);
  const quote = offer && shipParcel ? quoteSale(offer, shipParcel) : null;
  const blockReason = useMemo(
    () => salesDisabledReason(state, offerId, qty, shipParcel),
    [state, offerId, qty, shipParcel],
  );

  const canSell = !blockReason && offer && shipParcel;

  return (
    <div>
      <p className="sys-muted sales-guide">
        出貨佔用模擬時間。地圖會畫路線，到港才入帳。出貨點必須從下拉選擇。
      </p>
      <div className="market-hub-cue">
        <img
          src={ASSET_SLOTS.ui.marketHub}
          alt=""
          width={48}
          height={48}
          draggable={false}
          decoding="async"
          data-art-slot={MAP_ART_SLOT.marketHub}
        />
        <span>
          港區市場
          <small>
            ({MARKET_HUB.x},{MARKET_HUB.y})
          </small>
        </span>
      </div>
      <div className="npc-row">
        <img
          className="npc-slot"
          src={ASSET_SLOTS.npcMerchant}
          alt=""
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
        <span className="npc-fallback">港區收購商</span>
      </div>
      <label className="sales-field">
        <span>收購項目</span>
        <select value={offerId} onChange={(e) => setOfferId(e.target.value)}>
          {state.npcBuyOffers.map((o) => (
            <option key={o.id} value={o.id}>
              {ITEMS[o.itemId].nameZh} · 港價 ${o.unitPrice}
            </option>
          ))}
        </select>
      </label>
      {offer && (
        <p className="sys-muted">
          庫存 {getItemQty(stock, offer.itemId)} · 本日上限 {offer.maxQuantity}
        </p>
      )}
      <label className="sales-field">
        <span>出貨點</span>
        <select value={shipKey} onChange={(event) => setShipKey(event.target.value)}>
          <option value="">選擇出貨點</option>
          {holdings.map((parcel) => (
            <option key={parcel.id.value} value={parcel.id.value}>
              ({parcel.x},{parcel.y}) · 到港 {manhattanToMarket(parcel)} 格
            </option>
          ))}
        </select>
      </label>
      <label className="sales-field">
        <span>數量</span>
        <input type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value))} />
      </label>
      {quote && shipParcel && (
        <dl className="sales-quote">
          <div>
            <dt>出貨點</dt>
            <dd>
              ({shipParcel.x},{shipParcel.y})
            </dd>
          </div>
          <div>
            <dt>港區牌價</dt>
            <dd>${quote.hubUnitPrice}</dd>
          </div>
          <div>
            <dt>運輸／單</dt>
            <dd>${quote.transportPerUnit}</dd>
          </div>
          <div>
            <dt>淨利／單</dt>
            <dd className={quote.netPerUnit > 0 ? 'pos' : 'neg'}>${quote.netPerUnit}</dd>
          </div>
        </dl>
      )}
      {blockReason && (
        <p className="sales-block-reason" role="alert">
          {blockReason}
        </p>
      )}
      {shipments.length > 0 ? (
        <ul className="shipment-list">
          {shipments.map((shipment) => (
            <li key={shipment.id}>
              {shipment.label} · 前往 ({shipment.toX},{shipment.toY})
            </li>
          ))}
        </ul>
      ) : (
        <p className="sys-muted">到貨才入帳。出貨點要從下拉明選，不會自動改成最近港區。</p>
      )}
      <button
        type="button"
        className="sys-btn full"
        disabled={!canSell}
        onClick={() => canSell && onSell(offer.id, qty, shipParcel.id)}
      >
        派出運輸
      </button>
    </div>
  );
}

function ShelfSale({
  state,
  selectedParcelId,
  onSetShelf,
}: {
  state: WorldState;
  selectedParcelId: ParcelId | null;
  onSetShelf: SalesPanelProps['onSetShelf'];
}) {
  const playerId = state.localPlayerId;
  const commerce = readCommerce(state);
  const stores = getPlayerHoldings(state, playerId).filter((parcel) => {
    const site = state.sites[parcel.id.value];
    return site?.phase === 'complete' && site.factoryTypeId === 'storefront';
  });
  const [storeKey, setStoreKey] = useState(stores[0]?.id.value ?? '');
  const [itemId, setItemId] = useState<ItemId>('hand-tool');
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState(ITEMS['hand-tool'].unitValue);
  const store = stores.find((parcel) => parcel.id.value === storeKey) ?? stores[0];
  const quote = store
    ? quoteRetailDay({
        parcel: store,
        itemId,
        unitPrice: Math.max(1, Math.round(price) || 1),
        qualityBand: commerce.qualityBand,
        clerks: commerce.staff.clerks,
        activeStores: Math.max(1, commerce.shelves.filter((shelf) => shelf.quantity > 0).length),
        rivals: commerce.rivals,
        campaigns: commerce.campaigns,
        events: commerce.events,
      })
    : null;

  useEffect(() => {
    if (selectedParcelId && stores.some((parcel) => parcel.id.value === selectedParcelId.value)) {
      setStoreKey(selectedParcelId.value);
    }
  }, [selectedParcelId, stores]);

  useEffect(() => {
    if (quote) {
      setPrice(quote.referencePrice);
    }
  }, [quote?.referencePrice, itemId, storeKey]);

  const stock = getItemQty(getPlayerInventory(state, playerId), itemId);
  const listing = store
    ? commerce.shelves.find((shelf) => shelf.parcelId === store.id.value)
    : undefined;

  return (
    <div>
      {stores.length === 0 ? null : (
        <>
          <label className="sales-field">
            <span>門市</span>
            <select value={store?.id.value ?? ''} onChange={(event) => setStoreKey(event.target.value)}>
              {stores.map((parcel) => (
                <option key={parcel.id.value} value={parcel.id.value}>
                  ({parcel.x},{parcel.y}) · {parcel.nearestCityName ?? '郊外'}
                </option>
              ))}
            </select>
          </label>
          <label className="sales-field">
            <span>商品</span>
            <select value={itemId} onChange={(event) => setItemId(event.target.value as ItemId)}>
              {CONSUMER_ITEM_IDS.map((id) => (
                <option key={id} value={id}>
                  {ITEMS[id].nameZh} · 庫存 {getItemQty(getPlayerInventory(state, playerId), id)}
                </option>
              ))}
            </select>
          </label>
          <label className="sales-field">
            <span>售價</span>
            <input
              type="number"
              min={1}
              value={price}
              onChange={(event) => setPrice(Number(event.target.value))}
            />
          </label>
          <label className="sales-field">
            <span>上架數量</span>
            <input
              type="number"
              min={1}
              value={qty}
              onChange={(event) => setQty(Number(event.target.value))}
            />
          </label>
          {quote ? <p className="sys-muted">日銷 {quote.units}</p> : null}
          {listing ? (
            <p className="sys-muted">
              架上 {ITEMS[listing.itemId].nameZh} × {listing.quantity} · ${listing.unitPrice}
            </p>
          ) : null}
          <button
            type="button"
            className="sys-btn full"
            disabled={!store || qty <= 0 || stock < qty || price <= 0}
            onClick={() => store && onSetShelf(store.id, itemId, Math.round(price), qty)}
          >
            從庫存上架
          </button>
        </>
      )}
    </div>
  );
}

function ContractSale({
  state,
  selectedParcelId,
  onAcceptContract,
}: {
  state: WorldState;
  selectedParcelId: ParcelId | null;
  onAcceptContract: SalesPanelProps['onAcceptContract'];
}) {
  const holdings = getPlayerHoldings(state, state.localPlayerId);
  const commerce = readCommerce(state);
  const stock = getPlayerInventory(state, state.localPlayerId);
  const [shipKey, setShipKey] = useState('');
  const preferred = selectedParcelId ? findParcel(state, selectedParcelId) : undefined;

  useEffect(() => {
    if (preferred?.ownerId === state.localPlayerId) {
      setShipKey(preferred.id.value);
    }
  }, [preferred?.id.value, preferred?.ownerId, state.localPlayerId]);

  const shipParcel = holdings.find((parcel) => parcel.id.value === shipKey);

  return (
    <div>
      <label className="sales-field">
        <span>出貨點</span>
        <select value={shipKey} onChange={(event) => setShipKey(event.target.value)}>
          <option value="">選擇出貨點</option>
          {holdings.map((parcel) => (
            <option key={parcel.id.value} value={parcel.id.value}>
              ({parcel.x},{parcel.y})
            </option>
          ))}
        </select>
      </label>
      <ul className="shipment-list">
        {commerce.contracts.map((contract) => {
          const have = getItemQty(stock, contract.itemId);
          const open = contract.status === 'open';
          return (
            <li key={contract.id}>
              <strong>
                {contract.cityName} · {ITEMS[contract.itemId].nameZh} × {contract.quantity}
              </strong>
              <span>
                ${contract.unitPrice.toLocaleString()} · 第 {contract.dueDay} 天
              </span>
              {open ? (
                <button
                  type="button"
                  className="sys-btn"
                  disabled={!shipParcel || have < contract.quantity}
                  onClick={() => shipParcel && onAcceptContract(contract.id, shipParcel.id)}
                >
                  接單 · {have}
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
