import {
  CHAIN_STAGES,
  FACTORY_TYPES,
  RECIPE_LIST,
  RECIPES,
  computeProductionTiming,
  findParcel,
  getProductionLine,
  getSite,
  getSiteLogisticsView,
  planProfitPerTick,
  quoteLocalDemand,
  recipeBlockReason,
  recipeOutputLabel,
  recipeSourceLabel,
  techStage,
  unitsUntilNextStage,
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

function formatProfit(value: number): string {
  return value.toLocaleString('zh-Hant', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
}

export function ProductionPanel({
  state,
  selectedParcelId,
  onStart,
  onStop,
  onAdvanceProduction,
  onDemolish,
}: ProductionPanelProps) {
  const playerId = state.localPlayerId;
  const crafted = state.craftedTotals[playerId];
  const stage = techStage(crafted);
  const parcel = selectedParcelId ? findParcel(state, selectedParcelId) : undefined;
  const site = selectedParcelId ? getSite(state, selectedParcelId) : undefined;
  const line = selectedParcelId ? getProductionLine(state, selectedParcelId) : undefined;
  const isFactory =
    parcel?.ownerId === playerId && site?.phase === 'complete' && parcel.state === 'building-ready';
  const pct =
    line && line.cycleTicks > 0 ? Math.round((line.progressTicks / line.cycleTicks) * 100) : 0;
  const activeRecipe = line ? RECIPES[line.recipeId] : undefined;
  const demand = parcel ? quoteLocalDemand(parcel) : undefined;
  const locationBonus =
    parcel && site?.phase === 'complete'
      ? getSiteLogisticsView(state.map, parcel, site, state.sites).locationBonus
      : 0;

  return (
    <section className="sys-panel production-panel">
      <header className="sys-panel-head">
        <span className="sys-panel-tag">MFG</span>
        <h2>產線與技術{parcel ? ` · (${parcel.x},${parcel.y})` : ''}</h2>
      </header>
      <ol className="stage-pills">
        {CHAIN_STAGES.map((entry) => (
          <li key={entry.id} className={stage >= entry.stage ? 'on' : 'off'}>
            {entry.stage + 1} {entry.nameZh}
          </li>
        ))}
      </ol>
      <p className="sys-muted chain-note">{unitsUntilNextStage(crafted)}</p>
      <div className="chain-scroll">
        {CHAIN_STAGES.map((entry) => (
          <section key={entry.id}>
            <h3>{entry.nameZh}</h3>
            <ul className="chain-list">
              {RECIPE_LIST.filter((recipe) => recipe.stage === entry.id).map((recipe) => (
                <li key={recipe.id}>
                  <span>
                    {recipeSourceLabel(recipe)} → {recipe.nameZh} → {recipeOutputLabel(recipe)}
                  </span>
                  <span className="chain-meta">
                    {recipe.buildings.map((id) => FACTORY_TYPES[id].nameZh).join('/')}
                    {recipe.minTechStage === 0 && recipe.stage === 'finish' ? ' · 捷徑' : ''}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <p className="sys-muted chain-note">
        規劃利潤／週期＝（產出名目 − 投入名目）÷ 週期。離供應樞紐 (0,0)
        越遠，週期越長、係數越低。煤炭、銅礦、石英砂粒要煉進合金板才收購。
      </p>

      {!isFactory || !parcel || !site || site.phase !== 'complete' || !demand ? (
        <p className="sys-muted">選擇已完工工廠（藍格）以排入配方。</p>
      ) : (
        <>
          <ParcelResourceBadge resource={parcel.resource} variant="prominent" />
          <p className="panel-hint">
            區位 +{locationBonus.toFixed(2)}（道路 {Math.round(parcel.roadAccess * 100)}% · 城市{' '}
            {Math.round(parcel.cityProximity * 100)}%）· 在此收購每週 {demand.weeklyVolume} 件，單價
            ${demand.unitPrice.toLocaleString()}
          </p>
          {line && activeRecipe ? (
            <>
              <p className="sys-muted">
                生產中：{activeRecipe.nameZh} · {FACTORY_TYPES[site.factoryTypeId].nameZh}
              </p>
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
                    {line.progressTicks}/{line.cycleTicks}（路程 +{line.workerTravelTicks}）
                  </dd>
                </div>
                <div>
                  <dt>產出係數</dt>
                  <dd>{(line.throughputFactor * 100).toFixed(0)}%</dd>
                </div>
                <div>
                  <dt>規劃利潤</dt>
                  <dd>
                    {formatProfit(
                      planProfitPerTick(activeRecipe, line.cycleTicks, line.throughputFactor),
                    )}
                    /週期
                  </dd>
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
                <button
                  type="button"
                  className="sys-btn secondary"
                  onClick={() => onStop(parcel.id)}
                >
                  停止
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="sys-muted">依地皮與技術排入配方。開採會消耗這塊地的儲量。</p>
              <ul className="recipe-list">
                {RECIPE_LIST.filter((recipe) => {
                  if (!(recipe.buildings as readonly string[]).includes(site.factoryTypeId)) {
                    return false;
                  }
                  if (recipe.sourceKind && recipe.sourceKind !== parcel.resource.kind) {
                    return false;
                  }
                  return true;
                }).map((recipe) => {
                  const blocked = recipeBlockReason({
                    recipe,
                    resourceKind: parcel.resource.kind,
                    factoryTypeId: site.factoryTypeId,
                    crafted,
                  });
                  const logistics = getSiteLogisticsView(state.map, parcel, site, state.sites);
                  const timing = computeProductionTiming(
                    recipe.baseCycleTicks,
                    recipe.travelTickPerDistance,
                    parcel,
                    logistics.factor,
                  );
                  const profit = planProfitPerTick(
                    recipe,
                    timing.cycleTicks,
                    timing.throughputFactor,
                  );
                  return (
                    <li key={recipe.id}>
                      <button
                        type="button"
                        className="sys-btn block"
                        disabled={Boolean(blocked)}
                        onClick={() => onStart(parcel.id, recipe.id)}
                      >
                        {recipe.nameZh}
                        <span className="recipe-io">
                          {recipeSourceLabel(recipe)} → {recipeOutputLabel(recipe)} ·{' '}
                          {timing.cycleTicks} 週期 · {formatProfit(profit)}/週期
                        </span>
                      </button>
                      {blocked ? <span className="recipe-block">{blocked}</span> : null}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          <button
            type="button"
            className="sys-btn danger full"
            onClick={() => onDemolish(parcel.id)}
          >
            拆除工廠
          </button>
        </>
      )}
      {!line ? (
        <button type="button" className="sys-btn chain-advance" onClick={onAdvanceProduction}>
          推進生產週期
        </button>
      ) : null}
    </section>
  );
}
