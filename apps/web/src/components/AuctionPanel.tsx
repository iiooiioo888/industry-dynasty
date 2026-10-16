import {
  findOpenLotForParcel,
  findParcel,
  minNextBid,
  type ParcelId,
  type WorldState,
} from '@industry-dynasty/sim';
import { useEffect, useState } from 'react';
import './AuctionPanel.css';

export interface AuctionPanelProps {
  state: WorldState;
  selectedParcelId: ParcelId | null;
  onBid: (parcelId: ParcelId, amount: number) => void;
  onSettle: (parcelId: ParcelId) => void;
}

export function AuctionPanel({ state, selectedParcelId, onBid, onSettle }: AuctionPanelProps) {
  const parcel = selectedParcelId ? findParcel(state, selectedParcelId) : undefined;
  const lot = selectedParcelId ? findOpenLotForParcel(state, selectedParcelId) : undefined;
  const player = state.players[state.localPlayerId];
  const suggested = lot ? minNextBid(lot) : 0;

  const [amount, setAmount] = useState(suggested);

  useEffect(() => {
    setAmount(suggested);
  }, [suggested, selectedParcelId?.value]);

  if (!selectedParcelId || !parcel) {
    return (
      <section className="panel auction-panel">
        <h2>土地拍賣</h2>
        <p className="panel-muted">請在地圖上選擇一塊土地。</p>
      </section>
    );
  }

  if (parcel.ownerId === state.localPlayerId) {
    const unpaid = state.unpaidLandTax[parcel.id.value] ?? 0;
    if (unpaid > 0) {
      return (
        <section className="panel auction-panel">
          <h2>土地稅</h2>
          <p className="panel-warn">座標 ({parcel.x}, {parcel.y}) 累計欠稅：${unpaid.toLocaleString()}</p>
        </section>
      );
    }
    return null;
  }

  if (!lot) {
    return (
      <section className="panel auction-panel">
        <h2>土地 ({parcel.x}, {parcel.y})</h2>
        <p className="panel-muted">目前無進行中的拍賣。</p>
      </section>
    );
  }

  return (
    <section className="panel auction-panel">
      <h2>土地拍賣</h2>
      <p>座標 ({parcel.x}, {parcel.y})</p>
      <dl className="auction-stats">
        <div>
          <dt>底價</dt>
          <dd>${lot.minPrice.toLocaleString()}</dd>
        </div>
        <div>
          <dt>目前最高價</dt>
          <dd>
            {lot.highBidderId ? `$${lot.highBid.toLocaleString()}` : '尚無出價'}
          </dd>
        </div>
        <div>
          <dt>建議出價</dt>
          <dd>${suggested.toLocaleString()}</dd>
        </div>
      </dl>
      <label className="bid-field">
        <span>你的出價</span>
        <input
          type="number"
          min={suggested}
          step={100}
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
        />
      </label>
      <div className="panel-actions">
        <button type="button" onClick={() => onBid(parcel.id, amount)}>
          出價
        </button>
        <button type="button" className="secondary" onClick={() => onSettle(parcel.id)}>
          結算拍賣
        </button>
      </div>
      <p className="panel-hint">
        結算後得標者扣款並取得土地。你的現金：${player.cash.toLocaleString()}
      </p>
    </section>
  );
}
