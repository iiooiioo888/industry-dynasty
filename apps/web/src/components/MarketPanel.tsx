import {
  denseZoneAt,
  findParcel,
  quoteLocalDemand,
  roadNamesAt,
  type ParcelId,
  type WorldState,
} from '@industry-dynasty/sim';
import { ArtSlot } from '../art/ArtSlot';
import '../art/art.css';
import './MarketPanel.css';

export interface MarketPanelProps {
  state: WorldState;
  selectedParcelId: ParcelId | null;
}

function accessLabel(roadAccess: number): string {
  if (roadAccess >= 0.95) {
    return '沿路';
  }
  if (roadAccess >= 0.7) {
    return '鄰路';
  }
  if (roadAccess >= 0.4) {
    return '近路';
  }
  return '偏遠';
}

export function MarketPanel({ state, selectedParcelId }: MarketPanelProps) {
  const parcel = selectedParcelId ? findParcel(state, selectedParcelId) : undefined;

  if (!parcel) {
    return (
      <section className="sys-panel market-panel">
        <header className="market-head">
          <ArtSlot slot="uiMarketHub" className="market-hub-art" />
          <h2>在地市場</h2>
        </header>
        <p className="panel-muted">
          點選地圖。人口越密，收購量與單價越高；靠近城市與道路才賣得動。
        </p>
      </section>
    );
  }

  const quote = quoteLocalDemand(parcel);
  const zone = denseZoneAt(state.map, parcel.x, parcel.y);
  const roads = roadNamesAt(state.map, parcel.x, parcel.y);
  const place =
    parcel.role === 'city-hub'
      ? (parcel.nearestCityName ?? '城市據點')
      : parcel.role === 'road'
        ? (roads[0] ?? '道路')
        : zone
          ? zone.name
          : parcel.nearestCityName
            ? `近${parcel.nearestCityName}`
            : '鄉野';

  return (
    <section className="sys-panel market-panel">
      <header className="market-head">
        <ArtSlot slot="uiMarketHub" className="market-hub-art" />
        <div>
          <h2>在地市場</h2>
          <p className="market-place">
            {place} · ({parcel.x}, {parcel.y})
          </p>
        </div>
      </header>
      {parcel.role === 'city-hub' ? (
        <p className="panel-muted">城市核心不出售。這裡的人口會抬高周圍土地的收購量與單價。</p>
      ) : null}
      {parcel.role === 'road' ? (
        <p className="panel-muted">
          {roads.length > 0 ? roads.join('、') : '道路'}
          不開放購買。緊鄰道路的土地較能把人口需求賣出去。
        </p>
      ) : null}
      <dl className="market-stats">
        <div>
          <dt>人口密度</dt>
          <dd>{parcel.populationDensity}</dd>
        </div>
        <div>
          <dt>每週可售</dt>
          <dd>{quote.weeklyVolume} 件</dd>
        </div>
        <div>
          <dt>收購單價</dt>
          <dd>${quote.unitPrice.toLocaleString()}</dd>
        </div>
      </dl>
      <p className="panel-hint">
        需求指數 {Math.round(quote.demandIndex * 100)} · 道路{accessLabel(parcel.roadAccess)} ·{' '}
        {parcel.nearestCityName
          ? `${parcel.nearestCityName} ${parcel.nearestCityDistance} 格`
          : '無城市'}
        。人口是主因，城市與道路再加成。
      </p>
    </section>
  );
}
