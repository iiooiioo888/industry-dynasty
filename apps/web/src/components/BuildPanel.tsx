import {
  FACTORY_TYPE_LIST,
  FACTORY_TYPES,
  STOREFRONT_MIN_DENSITY,
  constructionRemainingTicks,
  findParcel,
  getSite,
  quoteLocalDemand,
  type FactoryTypeId,
  type ParcelId,
  type WorldState,
} from '@industry-dynasty/sim';
import './BuildPanel.css';

export interface BuildPanelProps {
  state: WorldState;
  selectedParcelId: ParcelId | null;
  onStartBuild: (parcelId: ParcelId, factoryTypeId: FactoryTypeId) => void;
  onCancelBuild: (parcelId: ParcelId) => void;
}

export function BuildPanel({
  state,
  selectedParcelId,
  onStartBuild,
  onCancelBuild,
}: BuildPanelProps) {
  const player = state.players[state.localPlayerId];
  const parcel = selectedParcelId ? findParcel(state, selectedParcelId) : undefined;
  const site = selectedParcelId ? getSite(state, selectedParcelId) : undefined;
  const isOwner = parcel?.ownerId === state.localPlayerId;

  if (!selectedParcelId || !parcel || !isOwner || !player) {
    return null;
  }

  if (site?.phase === 'constructing') {
    const def = FACTORY_TYPES[site.factoryTypeId];
    const remaining = constructionRemainingTicks(site, state.clock.simMs, state.clock.paused);
    const pct = Math.round((site.progressTicks / site.totalTicks) * 100);
    const remainLabel = Number.isInteger(remaining) ? `${remaining}` : remaining.toFixed(1);
    return (
      <div className="plan-build">
        <h3>建造中 · {def.nameZh}</h3>
        <div className="progress-bar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <p className="panel-muted">
          {state.clock.paused ? '暫停，停工。' : '跟著模擬時間施工。'}剩餘 {remainLabel} 刻（
          {site.progressTicks}/{site.totalTicks}）
        </p>
        <div className="panel-actions">
          <button type="button" className="secondary" onClick={() => onCancelBuild(parcel.id)}>
            取消建造（退 50%）
          </button>
        </div>
      </div>
    );
  }

  if (site?.phase === 'complete' || parcel.state !== 'owned') {
    return null;
  }

  const demand = quoteLocalDemand(parcel);

  return (
    <div className="plan-build">
      <h3>建造</h3>
      <p className="panel-hint">
        週 {demand.weeklyVolume} · ${demand.unitPrice.toLocaleString()}
      </p>
      <ul className="factory-list">
        {FACTORY_TYPE_LIST.map((def) => {
          const denseEnough =
            def.id !== 'storefront' || parcel.populationDensity >= STOREFRONT_MIN_DENSITY;
          const affordable = player.cash >= def.buildCost && denseEnough;
          return (
            <li key={def.id}>
              <div className="factory-card">
                <strong>{def.nameZh}</strong>
                <p>
                  ${def.buildCost.toLocaleString()} · {def.buildTimeTicks} 刻
                </p>
                <p className="factory-meta">
                  {def.role === 'production'
                    ? `物流 ${def.baseLogisticsEfficiency.toFixed(2)}×`
                    : `$${def.dailyUpkeep}/日`}
                </p>
                <button
                  type="button"
                  disabled={!affordable}
                  onClick={() => onStartBuild(parcel.id, def.id)}
                >
                  {denseEnough ? '開始建造' : `人口密度需 ${STOREFRONT_MIN_DENSITY}`}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
