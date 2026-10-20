import {
  FACTORY_TYPES,
  MARKET_HUB,
  PARCEL_RESOURCE_DEFS,
  findOpenLotForParcel,
  listMapActors,
  listShipmentViews,
  quoteLocalDemand,
  ticksUntilDayClose,
  roadNamesAt,
  roadPresentationAt,
  type ClockSpeed,
  type Parcel,
  type ParcelId,
  type RoadLinks,
  type WorldState,
} from '@industry-dynasty/sim';
import { useEffect, useState, type CSSProperties } from 'react';
import { ASSET_SLOTS, MAP_ART_SLOT } from '../assets/slots';
import { cellFeatureArt, resolveMapFeatureArt, type CellFeatureArt } from '../map/map-feature-art';
import { MapCellFeatureArt } from './MapFeatureSprites';
import { ParcelFocusCard } from './ParcelFocusCard';
import './GameMap.css';

const NARROW_MAP_QUERY = '(max-width: 960px)';

function useNarrowMap(): boolean {
  const [narrow, setNarrow] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(NARROW_MAP_QUERY).matches : false,
  );
  useEffect(() => {
    const media = window.matchMedia(NARROW_MAP_QUERY);
    const apply = () => setNarrow(media.matches);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, []);
  return narrow;
}

export interface GameMapProps {
  state: WorldState;
  selectedParcelId: ParcelId | null;
  onSelectParcel: (parcelId: ParcelId) => void;
  onTogglePause: () => void;
  onSetSpeed: (speed: ClockSpeed) => void;
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
  joint: string | null,
): string {
  const classes = ['map-cell', 'interactive', `role-${parcel.role}`];
  if (joint) {
    classes.push(`road-${joint}`);
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

function primarySlot(art: CellFeatureArt | undefined): string | undefined {
  if (!art) {
    return undefined;
  }
  if (art.marketHub) {
    return MAP_ART_SLOT.marketHub;
  }
  if (art.cityHub) {
    return MAP_ART_SLOT.cityHub;
  }
  if (art.road) {
    return MAP_ART_SLOT.road;
  }
  if (art.popDense) {
    return MAP_ART_SLOT.popDense;
  }
  return undefined;
}

function roadLinkCode(links: RoadLinks): string {
  return (['n', 'e', 's', 'w'] as const).filter((dir) => links[dir]).join('');
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

const CLOCK_SPEED_OPTIONS = [1, 2, 4] as const satisfies readonly ClockSpeed[];

export function GameMap({
  state,
  selectedParcelId,
  onSelectParcel,
  onTogglePause,
  onSetSpeed,
}: GameMapProps) {
  const narrow = useNarrowMap();
  const { width, height } = state.map.size;
  const localId = state.localPlayerId;
  const openCount = state.auctionLots.filter((l) => l.status === 'open').length;
  const cityNames = state.map.cities.map((city) => city.name).join(' · ');
  const featureArt = resolveMapFeatureArt(state);
  const actors = listMapActors(state);
  const routes = listShipmentViews(state);

  return (
    <section className="map-shell" aria-label="世界地圖">
      <div className="map-toolbar">
        <span>地圖 · {cityNames || '點選土地'}</span>
        {openCount > 0 && <span className="map-auction-chip">拍賣中 {openCount}</span>}
        <span className="map-market-cue" title={`港區市場 (${MARKET_HUB.x}, ${MARKET_HUB.y})`}>
          <img
            src={ASSET_SLOTS.ui.marketHub}
            alt=""
            width={22}
            height={22}
            draggable={false}
            decoding="async"
            data-art-slot={MAP_ART_SLOT.marketHub}
          />
          港區 {MARKET_HUB.x},{MARKET_HUB.y}
        </span>
        <span className="map-dim">
          {width} × {height}
        </span>
        <div className="clock-controls" role="group" aria-label="模擬時間">
          <button
            type="button"
            className="clock-btn"
            onClick={onTogglePause}
            aria-pressed={state.clock.paused}
          >
            {state.clock.paused ? '繼續' : '暫停'}
          </button>
          {CLOCK_SPEED_OPTIONS.map((speed) => (
            <button
              key={speed}
              type="button"
              className={`clock-btn${!state.clock.paused && state.clock.speed === speed ? ' on' : ''}`}
              aria-pressed={!state.clock.paused && state.clock.speed === speed}
              onClick={() => onSetSpeed(speed)}
            >
              {speed}×
            </button>
          ))}
          <span className="clock-readout">
            {state.clock.paused ? '已暫停 · 工人停在原地' : `${state.clock.speed}× 進行中`} · 距日結{' '}
            {ticksUntilDayClose(state.clock.simMs)} 刻
          </span>
        </div>
      </div>
      <div
        className={`map-stage${narrow ? ' is-scroll-map' : ''}`}
        style={{ ['--map-cols' as string]: width, ['--map-rows' as string]: height }}
      >
        <div className="map-scroll">
          <div
            className="map-grid"
            style={{
              gridTemplateColumns: `repeat(${width}, minmax(${narrow ? '2.5rem' : '0'}, 1fr))`,
            }}
          >
            {state.map.parcels.map((parcel) => {
              const selected = selectedParcelId?.value === parcel.id.value;
              const isLocalOwner = parcel.ownerId === localId;
              const lot = findOpenLotForParcel(state, parcel.id);
              const hasOpenAuction = lot !== undefined && !parcel.ownerId && parcel.role === 'land';
              const hasBids = lot?.highBidderId != null;
              const isMarket = parcel.x === MARKET_HUB.x && parcel.y === MARKET_HUB.y;
              const site = state.sites[parcel.id.value];
              const siteClass =
                site?.phase === 'complete' && FACTORY_TYPES[site.factoryTypeId].role === 'retail'
                  ? ' site-store'
                  : site?.phase === 'complete' && FACTORY_TYPES[site.factoryTypeId].role === 'research'
                    ? ' site-lab'
                    : '';
              const road = roadPresentationAt(state.map.parcels, parcel, state.map.size);
              const art = cellFeatureArt(featureArt, parcel.x, parcel.y);
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
                  className={`${cellClass(parcel, selected, isLocalOwner, hasOpenAuction, hasBids, road?.joint ?? null)}${isMarket ? ' market-hub' : ''}${siteClass}`}
                  style={
                    showDensity
                      ? { backgroundColor: densityColor(parcel.populationDensity) }
                      : undefined
                  }
                  data-art-slot={primarySlot(art)}
                  data-role={parcel.role}
                  data-road-joint={road?.joint}
                  data-road-mode={road?.mode}
                  data-road-links={road ? roadLinkCode(road.links) : undefined}
                  data-road-rotation={road?.mode === 'tile' ? road.rotation : undefined}
                  onClick={() => onSelectParcel(parcel.id)}
                  title={ariaLabel(state, parcel)}
                  aria-label={ariaLabel(state, parcel)}
                >
                  <MapCellFeatureArt art={art} road={road} />
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
          {routes.length > 0 ? (
            <svg
              className="map-routes"
              viewBox={`0 0 ${width} ${height}`}
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              {routes.map((route) => (
                <polyline
                  key={route.id}
                  points={route.points
                    .map((point) => `${point.x + 0.5},${point.y + 0.5}`)
                    .join(' ')}
                  fill="none"
                  stroke="#7ec8ff"
                  strokeWidth={0.12}
                  strokeDasharray="0.28 0.16"
                />
              ))}
            </svg>
          ) : null}
          <div className="map-actors">
            {routes.map((route) => (
              <span
                key={route.id}
                className="map-cargo"
                style={{
                  left: `${((route.x + 0.5) / width) * 100}%`,
                  top: `${((route.y + 0.5) / height) * 100}%`,
                }}
                role="img"
                title={route.label}
                aria-label={route.label}
              >
                <span className={`map-worker-label${route.x > width * 0.65 ? ' flip' : ''}`}>
                  {route.label}
                </span>
              </span>
            ))}
            {actors.map((actor) => {
              const short = state.clock.paused ? `暫停 · ${actor.status}` : actor.status;
              const label = state.clock.paused ? `${short} · ${actor.label}` : actor.label;
              return (
                <span
                  key={actor.id}
                  className={`map-worker ${actor.activity} leg-${actor.leg}${state.clock.paused ? ' is-paused' : ''}`}
                  style={{
                    left: `${((actor.x + 0.5) / width) * 100}%`,
                    top: `${((actor.y + 0.5) / height) * 100}%`,
                  }}
                  role="img"
                  title={label}
                  aria-label={label}
                  data-activity={actor.activity}
                  data-leg={actor.leg}
                  data-paused={state.clock.paused ? 'true' : 'false'}
                >
                  <span className={`map-worker-label${actor.x > width * 0.65 ? ' flip' : ''}`}>
                    {short}
                  </span>
                </span>
              );
            })}
          </div>
        </div>
      </div>
      <p className="map-strategy">
        靠近人口密集區、城市與道路，收購量與單價較高。道路與城市核心不出售。工人分去程、樞紐、回程、作業，出貨沿路線走到港才入帳。
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
        <span>
          <i className="swatch site-store" /> 門市
        </span>
        <span>
          <i className="swatch site-lab" /> 研發室
        </span>
        <span>
          <i className="swatch worker-travel" /> 工人趕路
        </span>
        <span>
          <i className="swatch worker-work" /> 工人作業
        </span>
        <span>
          <i className="swatch worker-idle" /> 工人閒置
        </span>
        <span>
          <img
            className="swatch art-icon"
            src={ASSET_SLOTS.map.road}
            alt=""
            data-art-slot={MAP_ART_SLOT.road}
          />
          道路圖層
        </span>
        <span>
          <img
            className="swatch art-icon"
            src={ASSET_SLOTS.map.cityHub}
            alt=""
            data-art-slot={MAP_ART_SLOT.cityHub}
          />
          城市據點圖層
        </span>
        <span>
          <img
            className="swatch art-icon"
            src={ASSET_SLOTS.map.popDense}
            alt=""
            data-art-slot={MAP_ART_SLOT.popDense}
          />
          人口密集圖層
        </span>
        <span>
          <img
            className="swatch art-icon"
            src={ASSET_SLOTS.map.cityBuilding}
            alt=""
            data-art-slot={MAP_ART_SLOT.cityBuilding}
          />
          城市建築圖層
        </span>
        {featureArt.source === 'placeholder' && (
          <span className="map-legend-note">
            道路、城市與人口密集為美術占位；地理資料寫入後會改接同一組圖層鍵。
          </span>
        )}
      </div>
      {narrow ? (
        <ParcelFocusCard
          state={state}
          selectedParcelId={selectedParcelId}
          onSelectParcel={onSelectParcel}
        />
      ) : null}
    </section>
  );
}
