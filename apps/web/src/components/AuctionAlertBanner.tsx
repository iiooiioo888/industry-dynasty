import type { ParcelId, WorldState } from '@industry-dynasty/sim';
import { findParcel } from '@industry-dynasty/sim';
import { getContestedOpenLots, getOpenAuctionLots } from '../game/auction-ui';
import './AuctionAlertBanner.css';

export interface AuctionAlertBannerProps {
  state: WorldState;
  selectedParcelId: ParcelId | null;
}

export function AuctionAlertBanner({ state, selectedParcelId }: AuctionAlertBannerProps) {
  const openLots = getOpenAuctionLots(state);
  if (openLots.length === 0) {
    return null;
  }

  const contested = getContestedOpenLots(state);
  const selectedParcel = selectedParcelId ? findParcel(state, selectedParcelId) : undefined;
  const selectedOpen = selectedParcelId
    ? openLots.find((l) => l.parcelId.value === selectedParcelId.value)
    : undefined;

  return (
    <div className="auction-alert-banner" role="status" aria-live="polite">
      <span className="auction-alert-pulse" aria-hidden="true" />
      <div className="auction-alert-main">
        <strong>土地拍賣進行中</strong>
        <span className="auction-alert-count">{openLots.length} 宗開標</span>
        {contested.length > 0 && (
          <span className="auction-alert-contested">{contested.length} 宗已有出價</span>
        )}
      </div>
      {selectedOpen && selectedParcel ? (
        <div className="auction-alert-focus">
          目前選取 ({selectedParcel.x},{selectedParcel.y}) ·
          {selectedOpen.highBidderId
            ? ` 最高價 $${selectedOpen.highBid.toLocaleString()} — 請加價或結算`
            : ` 底價 $${selectedOpen.minPrice.toLocaleString()} — 請出價`}
        </div>
      ) : (
        <div className="auction-alert-focus">點選閃爍橙格土地進入拍賣</div>
      )}
    </div>
  );
}
