import {
  findParcel,
  getItemQty,
  getPlayerHoldings,
  getPlayerInventory,
  ITEMS,
  MARKET_HUB,
  quoteSale,
  resolveShipParcel,
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
}

function salesDisabledReason(
  state: WorldState,
  offerId: string,
  qty: number,
  shipParcel: ReturnType<typeof resolveShipParcel>,
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
    return '無法決定出貨土地。';
  }
  const quote = quoteSale(offer, shipParcel);
  if (quote.netPerUnit <= 0) {
    return `運輸 $${quote.transportPerUnit}/單 高於港價 $${quote.hubUnitPrice}；請購買更靠近市場的土地，或改賣高價品。`;
  }
  return null;
}

export function SalesPanel({ state, selectedParcelId, onSell }: SalesPanelProps) {
  const player = state.players[state.localPlayerId];
  const stock = getPlayerInventory(state, player.id);
  const holdings = getPlayerHoldings(state, player.id);
  const preferred = selectedParcelId ? findParcel(state, selectedParcelId) : undefined;
  const shipParcel = resolveShipParcel(holdings, preferred);

  const [offerId, setOfferId] = useState(state.npcBuyOffers[0]?.id ?? '');
  const [qty, setQty] = useState(1);

  useEffect(() => {
    if (!state.npcBuyOffers.some((o) => o.id === offerId)) {
      setOfferId(state.npcBuyOffers[0]?.id ?? '');
    }
  }, [state.npcBuyOffers, offerId]);

  const offer = state.npcBuyOffers.find((o) => o.id === offerId);
  const quote = offer && shipParcel ? quoteSale(offer, shipParcel) : null;
  const blockReason = useMemo(
    () => salesDisabledReason(state, offerId, qty, shipParcel),
    [state, offerId, qty, shipParcel],
  );

  const canSell = !blockReason && offer && shipParcel;

  return (
    <section className="sys-panel sales-panel">
      <header className="sys-panel-head">
        <span className="sys-panel-tag">SAL</span>
        <h2>NPC 收購 · 上架銷售</h2>
      </header>
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
      {holdings.length > 0 && shipParcel && preferred?.ownerId !== player.id && (
        <p className="sys-muted">
          未選你的土地時，已自動用最靠近市場的 ({shipParcel.x},{shipParcel.y}) 計算運輸。
        </p>
      )}
      <button
        type="button"
        className="sys-btn full"
        disabled={!canSell}
        onClick={() => canSell && onSell(offer.id, qty, shipParcel.id)}
      >
        確認上架並銷售
      </button>
    </section>
  );
}
