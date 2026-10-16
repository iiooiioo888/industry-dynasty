import {
  findParcel,
  getItemQty,
  getPlayerInventory,
  ITEMS,
  quoteSale,
  type ParcelId,
  type WorldState,
} from '@industry-dynasty/sim';
import { useState } from 'react';
import { ASSET_SLOTS } from '../assets/slots';
import './SalesPanel.css';

export interface SalesPanelProps {
  state: WorldState;
  selectedParcelId: ParcelId | null;
  onSell: (offerId: string, quantity: number, shipFromParcelId: ParcelId) => void;
}

export function SalesPanel({ state, selectedParcelId, onSell }: SalesPanelProps) {
  const player = state.players[state.localPlayerId];
  const stock = getPlayerInventory(state, player.id);
  const parcel = selectedParcelId ? findParcel(state, selectedParcelId) : undefined;
  const [offerId, setOfferId] = useState(state.npcBuyOffers[0]?.id ?? '');
  const [qty, setQty] = useState(1);

  const offer = state.npcBuyOffers.find((o) => o.id === offerId);
  const quote = offer && parcel ? quoteSale(offer, parcel) : null;

  return (
    <section className="sys-panel sales-panel">
      <header className="sys-panel-head">
        <span className="sys-panel-tag">SAL</span>
        <h2>NPC 收購 · 上架銷售</h2>
      </header>
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
              {ITEMS[o.itemId].nameZh} · ${o.unitPrice}（底價 ${o.floorPrice}）
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
      {quote && parcel && (
        <dl className="sales-quote">
          <div><dt>區域單價</dt><dd>${quote.unitPrice}</dd></div>
          <div><dt>運輸／單</dt><dd>${quote.transportPerUnit}</dd></div>
          <div><dt>淨利／單</dt><dd className={quote.netPerUnit > 0 ? 'pos' : 'neg'}>${quote.netPerUnit}</dd></div>
        </dl>
      )}
      <button
        type="button"
        className="sys-btn full"
        disabled={!offer || !parcel || parcel.ownerId !== player.id || !quote || quote.netPerUnit <= 0}
        onClick={() => offer && parcel && onSell(offer.id, qty, parcel.id)}
      >
        確認上架並銷售
      </button>
      {!parcel && <p className="sys-muted">請選擇你的土地作為出貨點（影響運輸與區域價）。</p>}
    </section>
  );
}
