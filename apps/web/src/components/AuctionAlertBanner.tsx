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
        <strong>拍賣 {openLots.length}</strong>
        {contested.length > 0 && (
          <span className="auction-alert-contested">競價 {contested.length}</span>
        )}
      </div>
      {selectedOpen && selectedParcel ? (
        <div className="auction-alert-focus">
          {selectedParcel.x},{selectedParcel.y} · $
          {(selectedOpen.highBidderId ? selectedOpen.highBid : selectedOpen.minPrice).toLocaleString()}
        </div>
      ) : null}
    </div>
  );
}
