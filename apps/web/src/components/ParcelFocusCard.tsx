import {
  MARKET_HUB,
  denseZoneAt,
  findOpenLotForParcel,
  getPlayerHoldings,
  listMapActors,
  roadNamesAt,
  type Parcel,
  type ParcelId,
  type WorldState,
} from '@industry-dynasty/sim';
import { useState } from 'react';
import { accessLabel, compassPoint, manhattan, relationPhrase } from './parcel-focus';
import './ParcelFocusCard.css';

export interface ParcelFocusCardProps {
  state: WorldState;
  selectedParcelId: ParcelId | null;
  onSelectParcel: (parcelId: ParcelId) => void;
}

function cityKey(parcel: Parcel): string {
  return parcel.nearestCityName ?? '鄉野';
}

function placeLabel(state: WorldState, parcel: Parcel): string {
  if (parcel.role === 'city-hub') {
    return `${parcel.nearestCityName ?? '城市'}核心`;
  }
  const roads = roadNamesAt(state.map, parcel.x, parcel.y);
  if (parcel.role === 'road') {
    return roads.join('、') || '道路';
  }
  const zone = denseZoneAt(state.map, parcel.x, parcel.y);
  if (zone) {
    return `${zone.name}（人口密集）`;
  }
  if (parcel.cityProximity > 0 && parcel.nearestCityName) {
    return `近${parcel.nearestCityName}，非密集區`;
  }
  return '鄉野';
}

function roadLabel(state: WorldState, parcel: Parcel): string {
  const roads = roadNamesAt(state.map, parcel.x, parcel.y);
  if (parcel.role === 'road') {
    return roads.join('、') || '道路';
  }
  const access = accessLabel(parcel.roadAccess);
  return roads.length > 0 ? `${access} · ${roads.join('、')}` : access;
}

export function ParcelFocusCard({ state, selectedParcelId, onSelectParcel }: ParcelFocusCardProps) {
  const { width, height } = state.map.size;
  const selected = selectedParcelId
    ? state.map.parcels.find((parcel) => parcel.id.value === selectedParcelId.value)
    : undefined;
  const holdings = getPlayerHoldings(state, state.localPlayerId);
  const holdingIds = new Set(holdings.map((parcel) => parcel.id.value));
  const choices = new Map<string, Parcel>();
  for (const lot of state.auctionLots) {
    if (lot.status !== 'open') {
      continue;
    }
    const parcel = state.map.parcels.find((item) => item.id.value === lot.parcelId.value);
    if (parcel) {
      choices.set(parcel.id.value, parcel);
    }
  }
  for (const parcel of holdings) {
    choices.set(parcel.id.value, parcel);
  }
  if (selected) {
    choices.set(selected.id.value, selected);
  }
  const choiceList = [...choices.values()];
  const [filter, setFilter] = useState<string | null>(null);
  const activeFilter =
    filter ?? selected?.nearestCityName ?? choiceList[0]?.nearestCityName ?? '全部';
  const visible =
    activeFilter === '全部'
      ? choiceList
      : choiceList.filter((parcel) => cityKey(parcel) === activeFilter);
  const sorted = [...visible].sort(
    (a, b) => a.nearestCityDistance - b.nearestCityDistance || a.y - b.y || a.x - b.x,
  );
  const cityNames = state.map.cities.map((city) => city.name);
  const selectedActor = selected
    ? listMapActors(state).find((actor) => actor.parcelKey === selected.id.value)
    : undefined;

  const centerX = (width - 1) / 2;
  const centerY = (height - 1) / 2;
  const city = selected
    ? state.map.cities.find((hub) => hub.name === selected.nearestCityName)
    : undefined;
  const cityCenter = city
    ? {
        x: city.x + (city.width - 1) / 2,
        y: city.y + (city.height - 1) / 2,
      }
    : null;

  const mapPoint = (x: number, y: number) => ({
    x: 18 + (width <= 1 ? 0 : (x / (width - 1)) * 124),
    y: 16 + (height <= 1 ? 0 : (y / (height - 1)) * 88),
  });

  return (
    <div className="parcel-focus">
      <p className="parcel-focus-note">手機不展開 16×12 全圖，改看這一格的方位與相對位置。</p>
      {state.clock.paused ? (
        <p className="parcel-focus-note">時間已暫停，工人停在原地，標籤是暫停當下的狀態。</p>
      ) : null}
      {selected ? (
        <article className="parcel-focus-card" aria-label={`地塊 ${selected.x},${selected.y} 方位`}>
          <header className="parcel-focus-head">
            <span className="parcel-focus-coord">
              ({selected.x},{selected.y})
            </span>
            <span className="parcel-focus-bearing">
              {compassPoint(selected.x - centerX, selected.y - centerY)}
            </span>
            {findOpenLotForParcel(state, selected.id) ? (
              <span className="parcel-focus-tag">拍賣中</span>
            ) : holdingIds.has(selected.id.value) ? (
              <span className="parcel-focus-tag owned">持有</span>
            ) : null}
          </header>
          <div className="parcel-focus-layout">
            <svg className="mini-locator" viewBox="0 0 160 120" role="img" aria-label="簡圖定位">
              <rect className="locator-frame" x="14" y="12" width="132" height="96" rx="4" />
              <text className="locator-compass" x="80" y="10" textAnchor="middle">
                北
              </text>
              <text className="locator-compass" x="154" y="62" textAnchor="middle">
                東
              </text>
              <text className="locator-compass" x="80" y="118" textAnchor="middle">
                南
              </text>
              <text className="locator-compass" x="6" y="62" textAnchor="middle">
                西
              </text>
              {state.map.cities.map((hub) => {
                const point = mapPoint(hub.x + (hub.width - 1) / 2, hub.y + (hub.height - 1) / 2);
                return (
                  <g key={hub.id}>
                    <rect
                      className="locator-city"
                      x={point.x - 3}
                      y={point.y - 3}
                      width="6"
                      height="6"
                    />
                    <text className="locator-label" x={point.x + 5} y={point.y + 3}>
                      {hub.name.replace('市', '')}
                    </text>
                  </g>
                );
              })}
              {(() => {
                const market = mapPoint(MARKET_HUB.x, MARKET_HUB.y);
                return (
                  <g>
                    <rect
                      className="locator-market"
                      x={market.x - 3}
                      y={market.y - 3}
                      width="6"
                      height="6"
                      transform={`rotate(45 ${market.x} ${market.y})`}
                    />
                    <text className="locator-label" x={market.x - 16} y={market.y - 4}>
                      港
                    </text>
                  </g>
                );
              })()}
              {(() => {
                const point = mapPoint(selected.x, selected.y);
                return <circle className="locator-parcel" cx={point.x} cy={point.y} r="5" />;
              })()}
              {listMapActors(state).map((actor) => {
                const point = mapPoint(actor.x, actor.y);
                const label = state.clock.paused ? `已暫停 · ${actor.label}` : actor.label;
                return (
                  <circle
                    key={actor.id}
                    className={`locator-worker ${actor.activity}${state.clock.paused ? ' is-paused' : ''}`}
                    cx={point.x}
                    cy={point.y}
                    r="3.5"
                    data-activity={actor.activity}
                    data-paused={state.clock.paused ? 'true' : 'false'}
                  >
                    <title>{label}</title>
                  </circle>
                );
              })}
            </svg>
            <dl className="parcel-focus-facts">
              <div>
                <dt>座標</dt>
                <dd>
                  ({selected.x}, {selected.y}) · 範圍 {width}×{height}
                </dd>
              </div>
              <div>
                <dt>地圖方位</dt>
                <dd>
                  {relationPhrase(
                    '地圖中心',
                    selected.x - centerX,
                    selected.y - centerY,
                    manhattan(selected.x, selected.y, centerX, centerY),
                  )}
                </dd>
              </div>
              <div>
                <dt>城市</dt>
                <dd>
                  {!city
                    ? '無城市'
                    : selected.nearestCityDistance === 0
                      ? `${city.name}核心`
                      : cityCenter
                        ? relationPhrase(
                            city.name,
                            selected.x - cityCenter.x,
                            selected.y - cityCenter.y,
                            selected.nearestCityDistance,
                          )
                        : city.name}
                </dd>
              </div>
              <div>
                <dt>街區／道路</dt>
                <dd>
                  {placeLabel(state, selected)} · {roadLabel(state, selected)}
                </dd>
              </div>
              {selectedActor ? (
                <div>
                  <dt>工人</dt>
                  <dd>
                    {state.clock.paused ? `已暫停 · ${selectedActor.label}` : selectedActor.label}
                  </dd>
                </div>
              ) : null}
              <div>
                <dt>港區</dt>
                <dd>
                  {relationPhrase(
                    '港區',
                    selected.x - MARKET_HUB.x,
                    selected.y - MARKET_HUB.y,
                    manhattan(selected.x, selected.y, MARKET_HUB.x, MARKET_HUB.y),
                  )}
                </dd>
              </div>
            </dl>
          </div>
        </article>
      ) : (
        <p className="parcel-focus-empty">
          選擇下方拍賣或持有土地，查看這一格在城市、道路與港區的哪一側。
        </p>
      )}
      <div className="parcel-focus-filters" role="tablist" aria-label="依城市篩選">
        <button
          type="button"
          className={activeFilter === '全部' ? 'on' : ''}
          aria-pressed={activeFilter === '全部'}
          onClick={() => setFilter('全部')}
        >
          全部
        </button>
        {cityNames.map((name) => (
          <button
            key={name}
            type="button"
            className={activeFilter === name ? 'on' : ''}
            aria-pressed={activeFilter === name}
            onClick={() => setFilter(name)}
          >
            {name}
          </button>
        ))}
      </div>
      <ul className="parcel-focus-list">
        {sorted.length === 0 ? (
          <li className="parcel-focus-empty">這個方位沒有拍賣或持有土地。</li>
        ) : (
          sorted.map((parcel) => {
            const point = compassPoint(parcel.x - centerX, parcel.y - centerY);
            const open = findOpenLotForParcel(state, parcel.id) !== undefined;
            const pressed = selected?.id.value === parcel.id.value;
            return (
              <li key={parcel.id.value}>
                <button
                  type="button"
                  aria-pressed={pressed}
                  className={pressed ? 'on' : ''}
                  onClick={() => onSelectParcel(parcel.id)}
                >
                  <span>
                    ({parcel.x},{parcel.y}) · {point} · {placeLabel(state, parcel)}
                  </span>
                  <span className="parcel-focus-row-tag">{open ? '拍賣' : '持有'}</span>
                </button>
              </li>
            );
          })
        )}
      </ul>
    </div>
  );
}
