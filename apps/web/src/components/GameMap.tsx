import {
  MARKET_HUB,
  PARCEL_RESOURCE_DEFS,
  enterFloorBlock,
  listCityOrders,
  findOpenLotForParcel,
  listMapActors,
  getProductionLine,
  listShipmentViews,
  listSupplyHauls,
  listSupplyHaulViews,
  quoteLocalDemand,
  roadNamesAt,
  roadPresentationAt,
  type ClockSpeed,
  type MapLayer,
  type Parcel,
  type ParcelId,
  type RoadLinks,
  type WorldState,
} from '@industry-dynasty/sim';
import { useEffect, useState, type CSSProperties } from 'react';
import { ASSET_SLOTS, MAP_ART_SLOT } from '../assets/slots';
import { cellFeatureArt, resolveMapFeatureArt, type CellFeatureArt } from '../map/map-feature-art';
import { FactoryFloor } from './FactoryFloor';
import type { FloorDeskProps } from './FloorDesk';
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
  mapView: MapLayer;
  onShowWorld: () => void;
  onShowFloor: () => void;
  floorCommands: Omit<FloorDeskProps, 'state' | 'parcelId' | 'station'>;
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
  mapView,
  onShowWorld,
  onShowFloor,
  floorCommands,
  onSelectParcel,
  onTogglePause,
  onSetSpeed,
}: GameMapProps) {
  const narrow = useNarrowMap();
  const { width, height } = state.map.size;
  const localId = state.localPlayerId;
  const featureArt = resolveMapFeatureArt(state);
  const actors = listMapActors(state);
  const routes = listShipmentViews(state);
  const hauls = listSupplyHaulViews(state);
  const inboundParcels = new Set(listSupplyHauls(state).map((haul) => haul.toParcelId));
  const floorBlock = selectedParcelId
    ? enterFloorBlock(state, selectedParcelId)
    : '先在大世界點一棟完工的建物';
  const onFloor = mapView === 'floor' && floorBlock === null && selectedParcelId !== null;
  const openOrders = listCityOrders(state).filter((order) => order.filled < order.quantity);

  return (
    <section className="map-shell" aria-label={onFloor ? '廠房地圖' : '世界地圖'} data-map-layer={onFloor ? 'floor' : 'world'}>
      <div className="map-toolbar">
        <div className="map-layer-switch" role="group" aria-label="地圖層">
          <button
            type="button"
            className={`clock-btn${onFloor ? '' : ' on'}`}
            aria-pressed={!onFloor}
            onClick={onShowWorld}
          >
            大世界
          </button>
          <button
            type="button"
            className={`clock-btn${onFloor ? ' on' : ''}`}
            aria-pressed={onFloor}
            disabled={floorBlock !== null}
            title={floorBlock ?? '進入這棟建物'}
            onClick={onShowFloor}
          >
            廠房
          </button>
        </div>
        <span className="map-market-cue" title={`港區 (${MARKET_HUB.x}, ${MARKET_HUB.y})`}>
          <img
            src={ASSET_SLOTS.ui.marketHub}
            alt=""
            width={22}
            height={22}
            draggable={false}
            decoding="async"
            data-art-slot={MAP_ART_SLOT.marketHub}
          />
          港區
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
        </div>
      </div>
      <div
        className={`map-stage${narrow && !onFloor ? ' is-scroll-map' : ''}`}
        style={{ ['--map-cols' as string]: width, ['--map-rows' as string]: height }}
      >
        {onFloor && selectedParcelId ? (
          <FactoryFloor state={state} parcelId={selectedParcelId} commands={floorCommands} />
        ) : null}
        {onFloor ? null : (
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
              const road = roadPresentationAt(state.map.parcels, parcel, state.map.size);
              const art = cellFeatureArt(featureArt, parcel.x, parcel.y);
              const city = state.map.cities.find((hub) => hub.x === parcel.x && hub.y === parcel.y);
              const showDensity =
                parcel.role === 'land' &&
                !hasOpenAuction &&
                !isLocalOwner &&
                !parcel.ownerId &&
                parcel.state === 'empty';
              const floorReady = enterFloorBlock(state, parcel.id) === null;
              const orderCity =
                parcel.role === 'city-hub'
                  ? state.map.cities.find(
                      (city) =>
                        parcel.x >= city.x &&
                        parcel.x < city.x + city.width &&
                        parcel.y >= city.y &&
                        parcel.y < city.y + city.height,
                    )
                  : undefined;
              const hasCityOrder = orderCity
                ? openOrders.some((order) => order.cityId === orderCity.id)
                : false;
              const lineHere = getProductionLine(state, parcel.id);
              const supplyMark =
                lineHere?.status === 'waiting_inputs'
                  ? '缺'
                  : inboundParcels.has(parcel.id.value)
                    ? '送'
                    : null;
              return (
                <button
                  key={parcel.id.value}
                  type="button"
                  className={`${cellClass(parcel, selected, isLocalOwner, hasOpenAuction, hasBids, road?.joint ?? null)}${isMarket ? ' market-hub' : ''}${floorReady ? ' floor-ready' : ''}`}
                  data-floor-ready={floorReady ? 'true' : undefined}
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
                  title={floorReady ? `${ariaLabel(state, parcel)}，可進入廠房` : ariaLabel(state, parcel)}
                  aria-label={floorReady ? `${ariaLabel(state, parcel)}，可進入廠房` : ariaLabel(state, parcel)}
                >
                  <MapCellFeatureArt art={art} road={road} />
                  {city ? <span className="city-label">{city.name}</span> : null}
                  {hasOpenAuction && (
                    <span className="map-cell-auction-tag" aria-hidden="true">
                      拍
                    </span>
                  )}
                  {floorReady ? (
                    <span className="map-cell-floor-tag" aria-hidden="true">
                      房
                    </span>
                  ) : null}
                  {hasCityOrder ? (
                    <span className="map-cell-order-tag" aria-hidden="true">
                      約
                    </span>
                  ) : null}
                  {supplyMark ? (
                    <span
                      className={`map-cell-supply-tag${supplyMark === '缺' ? ' is-short' : ''}`}
                      aria-hidden="true"
                    >
                      {supplyMark}
                    </span>
                  ) : null}
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
          {routes.length > 0 || hauls.length > 0 ? (
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
              {hauls.map((haul) => (
                <polyline
                  key={haul.id}
                  points={haul.points
                    .map((point) => `${point.x + 0.5},${point.y + 0.5}`)
                    .join(' ')}
                  fill="none"
                  stroke="#e3b341"
                  strokeWidth={0.2}
                  strokeLinecap="round"
                  strokeDasharray="0.22 0.12"
                />
              ))}
            </svg>
          ) : null}
          <div className="map-actors">
            {hauls.map((haul) => (
              <span
                key={haul.id}
                className="map-cargo supply"
                style={{
                  left: `${((haul.x + 0.5) / width) * 100}%`,
                  top: `${((haul.y + 0.5) / height) * 100}%`,
                }}
                role="img"
                title={haul.label}
                aria-label={haul.label}
              >
                <span className={`map-worker-label${haul.x > width * 0.65 ? ' flip' : ''}`}>
                  {haul.label}
                </span>
              </span>
            ))}
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
        )}
      </div>
      {onFloor ? null : (
      <div className="map-legend">
        <span>
          <i className="swatch auction-live" /> 拍賣
        </span>
        <span>
          <i className="swatch road" /> 道路
        </span>
        <span>
          <i className="swatch city" /> 城市
        </span>
        <span>
          <i className="swatch owned" /> 持有
        </span>
        <span>
          <i className="swatch supply" /> 送料
        </span>
        <span>房 可進入</span>
      </div>
      )}
      {narrow && !onFloor ? (
        <ParcelFocusCard
          state={state}
          selectedParcelId={selectedParcelId}
          onSelectParcel={onSelectParcel}
        />
      ) : null}
    </section>
  );
}
