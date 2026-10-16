import {
  MARKET_HUB,
  PARCEL_RESOURCE_DEFS,
  findOpenLotForParcel,
  type Parcel,
  type ParcelId,
  type WorldState,
} from '@industry-dynasty/sim';
import type { CSSProperties } from 'react';
import './GameMap.css';

export interface GameMapProps {
  state: WorldState;
  selectedParcelId: ParcelId | null;
  onSelectParcel: (parcelId: ParcelId) => void;
}

function cellClass(
  parcel: Parcel,
  isSelected: boolean,
  isLocalOwner: boolean,
  hasOpenAuction: boolean,
  hasBids: boolean,
): string {
  const classes = ['map-cell', 'interactive'];
  if (hasOpenAuction && !parcel.ownerId) {
    classes.push('auction-live');
    if (hasBids) {
      classes.push('auction-bids');
    }
  }
  if (isSelected) {
    classes.push('selected');
    if (hasOpenAuction) {
      classes.push('auction-selected');
    }
  }
  if (parcel.state === 'building') {
    classes.push('under-construction');
  } else if (parcel.state === 'building-ready') {
    classes.push('building-ready');
  } else if (isLocalOwner) {
    classes.push('owned');
  } else if (parcel.ownerId) {
    classes.push('other-owned');
  } else if (!hasOpenAuction) {
    classes.push('empty');
  }
  return classes.join(' ');
}

export function GameMap({ state, selectedParcelId, onSelectParcel }: GameMapProps) {
  const { width, height } = state.map.size;
  const localId = state.localPlayerId;
  const openCount = state.auctionLots.filter((l) => l.status === 'open').length;

  return (
    <section className="map-shell" aria-label="世界地圖">
      <div className="map-toolbar">
        <span>地圖 · 點選土地</span>
        {openCount > 0 && (
          <span className="map-auction-chip">拍賣中 {openCount}</span>
        )}
        <span className="map-dim">{width} × {height}</span>
      </div>
      <div
        className="map-grid"
        style={{ gridTemplateColumns: `repeat(${width}, minmax(0, 1fr))` }}
      >
        {state.map.parcels.map((parcel) => {
          const selected = selectedParcelId?.value === parcel.id.value;
          const isLocalOwner = parcel.ownerId === localId;
          const lot = findOpenLotForParcel(state, parcel.id);
          const hasOpenAuction = lot !== undefined && !parcel.ownerId;
          const hasBids = lot?.highBidderId != null;
          const isMarket =
            parcel.x === MARKET_HUB.x && parcel.y === MARKET_HUB.y;
          return (
            <button
              key={parcel.id.value}
              type="button"
              className={`${cellClass(parcel, selected, isLocalOwner, hasOpenAuction, hasBids)}${isMarket ? ' market-hub' : ''}`}
              onClick={() => onSelectParcel(parcel.id)}
              title={
                hasOpenAuction
                  ? `拍賣中 (${parcel.x}, ${parcel.y})`
                  : `(${parcel.x}, ${parcel.y})`
              }
              aria-label={
                hasOpenAuction
                  ? `拍賣中 土地 ${parcel.x}, ${parcel.y}`
                  : `土地 ${parcel.x}, ${parcel.y}`
              }
            >
              {hasOpenAuction && <span className="map-cell-auction-tag" aria-hidden="true">拍</span>}
              <span
                className="map-cell-resource-dot"
                style={
                  { '--res-hue': `${PARCEL_RESOURCE_DEFS[parcel.resource.kind].colorHue}` } as CSSProperties
                }
                title={`${parcel.resource.nameZh} · 儲量${parcel.resource.reserves}`}
                aria-hidden="true"
              />
            </button>
          );
        })}
      </div>
      <div className="map-legend">
        <span><i className="swatch auction-live" /> 拍賣中（閃爍）</span>
        <span><i className="swatch owned" /> 你的土地</span>
        <span><i className="swatch under-construction" /> 建造中</span>
        <span><i className="swatch building-ready" /> 工廠運營</span>
      </div>
    </section>
  );
}
