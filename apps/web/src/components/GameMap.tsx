import {
  MARKET_HUB,
  PARCEL_RESOURCE_DEFS,
  findOpenLotForParcel,
  quoteLocalDemand,
  roadAxisAt,
  roadNamesAt,
  type Parcel,
  type ParcelId,
  type WorldState,
} from '@industry-dynasty/sim';
import type { CSSProperties } from 'react';
import { ArtSlot } from '../art/ArtSlot';
import { ART_SLOTS } from '../art/slots';
import '../art/art.css';
import './GameMap.css';

export interface GameMapProps {
  state: WorldState;
  selectedParcelId: ParcelId | null;
  onSelectParcel: (parcelId: ParcelId) => void;
}

function densityColor(density: number): string {
  const t = Math.min(1, Math.max(0, density / 100));
  const lerp = (from: number, to: number) => Math.round(from + (to - from) * t);
  return `rgb(${lerp(26, 154)}, ${lerp(34, 62)}, ${lerp(46, 52)})`;
}

function cellClass(
  parcel: Parcel,
  isSelected: boolean,
  isLocalOwner: boolean,
  hasOpenAuction: boolean,
  hasBids: boolean,
  axis: string | null,
): string {
  const classes = ['map-cell', 'interactive', `role-${parcel.role}`];
  if (axis) {
    classes.push(`road-${axis}`);
  }
  if (hasOpenAuction && parcel.role === 'land') {
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
  if (parcel.role === 'land') {
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
  }
  return classes.join(' ');
}

function primaryArt(parcel: Parcel): 'mapRoad' | 'mapCityHub' | 'mapPopDense' | null {
  if (parcel.role === 'road') {
    return 'mapRoad';
  }
  if (parcel.role === 'city-hub') {
    return 'mapCityHub';
  }
  if (parcel.populationDensity >= 70) {
    return 'mapPopDense';
  }
  return null;
}

function ariaLabel(state: WorldState, parcel: Parcel): string {
  const quote = quoteLocalDemand(parcel);
  const role =
    parcel.role === 'road'
      ? roadNamesAt(state.map, parcel.x, parcel.y).join('、') || '道路'
      : parcel.role === 'city-hub'
        ? (parcel.nearestCityName ?? '城市據點')
        : '土地';
  const auction = findOpenLotForParcel(state, parcel.id) ? '，拍賣中' : '';
  return `${role} ${parcel.x},${parcel.y}${auction}，人口密度 ${parcel.populationDensity}，每週 ${quote.weeklyVolume} 件，單價 ${quote.unitPrice}`;
}

export function GameMap({ state, selectedParcelId, onSelectParcel }: GameMapProps) {
  const { width, height } = state.map.size;
  const localId = state.localPlayerId;
  const openCount = state.auctionLots.filter((l) => l.status === 'open').length;
  const cityNames = state.map.cities.map((city) => city.name).join(' · ');

  return (
    <section className="map-shell" aria-label="世界地圖">
      <div className="map-toolbar">
        <span>地圖 · {cityNames || '點選土地'}</span>
        {openCount > 0 && <span className="map-auction-chip">拍賣中 {openCount}</span>}
        <span className="map-dim">
          {width} × {height}
        </span>
      </div>
      <div className="map-grid" style={{ gridTemplateColumns: `repeat(${width}, minmax(0, 1fr))` }}>
        {state.map.parcels.map((parcel) => {
          const selected = selectedParcelId?.value === parcel.id.value;
          const isLocalOwner = parcel.ownerId === localId;
          const lot = findOpenLotForParcel(state, parcel.id);
          const hasOpenAuction = lot !== undefined && !parcel.ownerId && parcel.role === 'land';
          const hasBids = lot?.highBidderId != null;
          const isMarket = parcel.x === MARKET_HUB.x && parcel.y === MARKET_HUB.y;
          const axis = roadAxisAt(state.map.parcels, parcel);
          const art = primaryArt(parcel);
          const city = state.map.cities.find((hub) => hub.x === parcel.x && hub.y === parcel.y);
          const showDensity =
            parcel.role === 'land' &&
            !hasOpenAuction &&
            !isLocalOwner &&
            !parcel.ownerId &&
            parcel.state === 'empty';
          return (
            <button
              key={parcel.id.value}
              type="button"
              className={`${cellClass(parcel, selected, isLocalOwner, hasOpenAuction, hasBids, axis)}${isMarket ? ' market-hub' : ''}`}
              style={
                showDensity
                  ? { backgroundColor: densityColor(parcel.populationDensity) }
                  : undefined
              }
              data-art-slot={art ? ART_SLOTS[art].id : undefined}
              data-role={parcel.role}
              onClick={() => onSelectParcel(parcel.id)}
              title={ariaLabel(state, parcel)}
              aria-label={ariaLabel(state, parcel)}
            >
              {axis === 'cross' ? (
                <>
                  <span className="road-stripe h" />
                  <span className="road-stripe v" />
                </>
              ) : axis ? (
                <span className="road-stripe" />
              ) : null}
              {art ? <ArtSlot slot={art} /> : null}
              {parcel.role === 'city-hub' ? (
                <ArtSlot slot="mapCityBuilding" className="city-building" />
              ) : null}
              {city ? <span className="city-label">{city.name}</span> : null}
              {hasOpenAuction && (
                <span className="map-cell-auction-tag" aria-hidden="true">
                  拍
                </span>
              )}
              {parcel.role === 'land' && (
                <span
                  className="map-cell-resource-dot"
                  style={
                    {
                      '--res-hue': `${PARCEL_RESOURCE_DEFS[parcel.resource.kind].colorHue}`,
                    } as CSSProperties
                  }
                  title={`${parcel.resource.nameZh} · 儲量${parcel.resource.reserves}`}
                  aria-hidden="true"
                />
              )}
            </button>
          );
        })}
      </div>
      <p className="map-strategy">
        靠近人口密集區、城市與道路，收購量與單價較高。道路與城市核心不出售。
      </p>
      <div className="map-legend">
        <span>
          <i className="swatch auction-live" /> 拍賣中（閃爍）
        </span>
        <span>
          <i className="swatch heat" /> 人口熱度
        </span>
        <span>
          <i className="swatch road" /> 道路
        </span>
        <span>
          <i className="swatch city" /> 城市據點
        </span>
        <span>
          <i className="swatch owned" /> 你的土地
        </span>
        <span>
          <i className="swatch under-construction" /> 建造中
        </span>
        <span>
          <i className="swatch building-ready" /> 工廠運營
        </span>
      </div>
    </section>
  );
}
