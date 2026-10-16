import {
  findParcel,
  getProductionLine,
  getSite,
  getSiteLogisticsView,
  quoteLocalDemand,
  RECIPE_LIST,
  type ParcelId,
  type RecipeId,
  type WorldState,
} from '@industry-dynasty/sim';
import { ParcelResourceBadge } from './ParcelResourceBadge';
import './ProductionPanel.css';

export interface ProductionPanelProps {
  state: WorldState;
  selectedParcelId: ParcelId | null;
  onStart: (parcelId: ParcelId, recipeId: RecipeId) => void;
  onStop: (parcelId: ParcelId) => void;
  onAdvanceProduction: () => void;
  onDemolish: (parcelId: ParcelId) => void;
}

export function ProductionPanel({
  state,
  selectedParcelId,
  onStart,
  onStop,
  onAdvanceProduction,
  onDemolish,
}: ProductionPanelProps) {
  const parcel = selectedParcelId ? findParcel(state, selectedParcelId) : undefined;
  const site = selectedParcelId ? getSite(state, selectedParcelId) : undefined;
  const line = selectedParcelId ? getProductionLine(state, selectedParcelId) : undefined;
  const isFactory =
    parcel?.ownerId === state.localPlayerId &&
    site?.phase === 'complete' &&
    parcel.state === 'building-ready';

  if (!isFactory || !parcel) {
    return (
      <section className="sys-panel production-panel">
        <header className="sys-panel-head">
          <span className="sys-panel-tag">MFG</span>
          <h2>生產線</h2>
        </header>
        <p className="sys-muted">選擇已完工工廠（藍格）以配置配方。</p>
        <button type="button" className="sys-btn" onClick={onAdvanceProduction}>
          推進生產週期
        </button>
      </section>
    );
  }

  const pct =
    line && line.cycleTicks > 0 ? Math.round((line.progressTicks / line.cycleTicks) * 100) : 0;
  const demand = quoteLocalDemand(parcel);
  const locationBonus =
    site?.phase === 'complete'
      ? getSiteLogisticsView(state.map, parcel, site, state.sites).locationBonus
      : 0;

  return (
    <section className="sys-panel production-panel">
      <header className="sys-panel-head">
        <span className="sys-panel-tag">MFG</span>
        <h2>
          生產線 · ({parcel.x},{parcel.y})
        </h2>
      </header>

      <ParcelResourceBadge resource={parcel.resource} variant="prominent" />
      {site?.phase === 'complete' ? (
        <p className="panel-hint">
          區位 +{locationBonus.toFixed(2)}（道路 {Math.round(parcel.roadAccess * 100)}% · 城市{' '}
          {Math.round(parcel.cityProximity * 100)}%）· 在此收購每週 {demand.weeklyVolume} 件，單價 $
          {demand.unitPrice.toLocaleString()}
        </p>
      ) : null}

      {line ? (
        <>
          <dl className="prod-metrics">
            <div>
              <dt>地皮加成</dt>
              <dd>
                {line.localResourceNameZh} ×{line.localResourceBonus.toFixed(2)}
              </dd>
            </div>
            <div>
              <dt>狀態</dt>
              <dd>
                {line.status === 'running' && '運轉中'}
                {line.status === 'waiting_inputs' && '待料（閒置損失）'}
                {line.status === 'stopped' && '已停止'}
              </dd>
            </div>
            <div>
              <dt>週期</dt>
              <dd>
                {line.progressTicks}/{line.cycleTicks}（工人路程 +{line.workerTravelTicks}）
              </dd>
            </div>
            <div>
              <dt>產出係數</dt>
              <dd>{(line.throughputFactor * 100).toFixed(0)}%</dd>
            </div>
            <div>
              <dt>產出價值</dt>
              <dd>${line.totalOutputValue}</dd>
            </div>
            <div>
              <dt>距離損失</dt>
              <dd className="warn">${line.totalDistanceLossValue}</dd>
            </div>
            <div>
              <dt>閒置損失</dt>
              <dd className="warn">${line.totalIdleLossValue}</dd>
            </div>
          </dl>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <div className="sys-btn-row">
            <button type="button" className="sys-btn" onClick={onAdvanceProduction}>
              推進生產週期
            </button>
            <button type="button" className="sys-btn secondary" onClick={() => onStop(parcel.id)}>
              停止
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="sys-muted">選擇固定配方開始生產（原料從庫存扣除）。</p>
          <ul className="recipe-list">
            {RECIPE_LIST.map((recipe) => (
              <li key={recipe.id}>
                <button
                  type="button"
                  className="sys-btn block"
                  onClick={() => onStart(parcel.id, recipe.id)}
                >
                  {recipe.nameZh}
                </button>
                <span className="recipe-io">
                  {recipe.inputs.map((i) => `${i.quantity}×${i.itemId}`).join(' + ')} →{' '}
                  {recipe.outputQuantity}×{recipe.outputItemId}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <button type="button" className="sys-btn danger full" onClick={() => onDemolish(parcel.id)}>
        拆除工廠
      </button>
    </section>
  );
}
