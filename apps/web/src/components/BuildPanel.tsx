import {
  FACTORY_TYPE_LIST,
  FACTORY_TYPES,
  findParcel,
  getSite,
  type FactoryTypeId,
  type ParcelId,
  type WorldState,
} from '@industry-dynasty/sim';
import './BuildPanel.css';

export interface BuildPanelProps {
  state: WorldState;
  selectedParcelId: ParcelId | null;
  onStartBuild: (parcelId: ParcelId, factoryTypeId: FactoryTypeId) => void;
  onAdvanceBuild: () => void;
  onCancelBuild: (parcelId: ParcelId) => void;
  onDemolish: (parcelId: ParcelId) => void;
}

export function BuildPanel({
  state,
  selectedParcelId,
  onStartBuild,
  onAdvanceBuild,
  onCancelBuild,
}: BuildPanelProps) {
  const player = state.players[state.localPlayerId];
  const parcel = selectedParcelId ? findParcel(state, selectedParcelId) : undefined;
  const site = selectedParcelId ? getSite(state, selectedParcelId) : undefined;
  const isOwner = parcel?.ownerId === state.localPlayerId;

  if (!selectedParcelId || !parcel || !isOwner) {
    return null;
  }

  if (site?.phase === 'constructing') {
    const def = FACTORY_TYPES[site.factoryTypeId];
    const pct = Math.round((site.progressTicks / site.totalTicks) * 100);
    return (
      <section className="sys-panel build-panel">
        <h2>建造中</h2>
        <p>{def.nameZh} · ({parcel.x}, {parcel.y})</p>
        <div className="progress-bar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <p className="panel-muted">
          進度 {site.progressTicks} / {site.totalTicks} 週期（{pct}%）
        </p>
        <div className="panel-actions">
          <button type="button" onClick={onAdvanceBuild}>推進建設週期</button>
          <button type="button" className="secondary" onClick={() => onCancelBuild(parcel.id)}>
            取消建造（退 50%）
          </button>
        </div>
      </section>
    );
  }

  if (site?.phase === 'complete') {
    return null;
  }

  if (parcel.state !== 'owned') {
    return null;
  }

  return (
    <section className="sys-panel build-panel">
      <header className="sys-panel-head">
        <span className="sys-panel-tag">BLD</span>
        <h2>建造選單</h2>
      </header>
      <p className="sys-muted">土地 ({parcel.x}, {parcel.y}) · 現金 ${player.cash.toLocaleString()}</p>
      <ul className="factory-list">
        {FACTORY_TYPE_LIST.map((def) => {
          const affordable = player.cash >= def.buildCost;
          return (
            <li key={def.id}>
              <div className="factory-card">
                <strong>{def.nameZh}</strong>
                <span className="factory-en">{def.nameEn}</span>
                <p>
                  費用 ${def.buildCost.toLocaleString()} · {def.buildTimeTicks} 週期 · 占地{' '}
                  {def.footprint.width}×{def.footprint.height}
                </p>
                <p className="factory-meta">
                  基礎物流 {def.baseLogisticsEfficiency.toFixed(2)}× · 每鄰 +{(def.adjacencyEfficiencyBonus * 100).toFixed(0)}%
                </p>
                <button
                  type="button"
                  disabled={!affordable}
                  onClick={() => onStartBuild(parcel.id, def.id)}
                >
                  開始建造
                </button>
              </div>
            </li>
          );
        })}
      </ul>
      <button type="button" className="secondary full" onClick={onAdvanceBuild}>
        推進建設週期
      </button>
    </section>
  );
}
