import {
  FACTORY_TYPE_LIST,
  FACTORY_TYPES,
  constructionRemainingTicks,
  findParcel,
  getSite,
  quoteLocalDemand,
  type FactoryTypeId,
  type ParcelId,
  type WorldState,
} from '@industry-dynasty/sim';
import { MachineCompare } from './MachineCompare';
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
        若在此銷售：每週約 {demand.weeklyVolume} 件，單價 ${demand.unitPrice.toLocaleString()}。
        開工後進度吃模擬時間，暫停就停工。加工機械在排產時選，不改產品。
      </p>
      <MachineCompare />
      <ul className="factory-list">
        {FACTORY_TYPE_LIST.map((def) => {
          const affordable = player.cash >= def.buildCost;
          return (
            <li key={def.id}>
              <div className="factory-card">
                <strong>{def.nameZh}</strong>
                <span className="factory-en">{def.nameEn}</span>
                <p>
                  費用 ${def.buildCost.toLocaleString()} · {def.buildTimeTicks} 刻 · 占地{' '}
                  {def.footprint.width}×{def.footprint.height}
                </p>
                <p className="factory-meta">
                  基礎物流 {def.baseLogisticsEfficiency.toFixed(2)}× · 每鄰 +
                  {(def.adjacencyEfficiencyBonus * 100).toFixed(0)}%
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
    </div>
  );
}
