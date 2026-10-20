import {
  CHAIN_STAGES,
  FACTORY_TYPES,
  MACHINE_GRADES,
  RECIPE_LIST,
  RECIPES,
  chainMarginCue,
  findParcel,
  getProductionLine,
  getSite,
  getSiteLogisticsView,
  nominalProfitPerTick,
  planProfitPerTick,
  projectLine,
  quoteLocalDemand,
  recipeOutputLabel,
  recipeSourceLabel,
  techStage,
  unitsUntilNextStage,
  type MachineGradeId,
  type ParcelId,
  type ProductionStatus,
  type WorldState,
} from '@industry-dynasty/sim';
import { useEffect, useId, useState } from 'react';
import { MachineCompare } from './MachineCompare';
import { ParcelResourceBadge } from './ParcelResourceBadge';
import './ProductionPanel.css';

/** 與控制台窄版斷點一致：此寬度以下視為手機／直向平板。 */
const NARROW_LAYOUT_QUERY = '(max-width: 960px)';

function useNarrowLayout(): boolean {
  const [narrow, setNarrow] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(NARROW_LAYOUT_QUERY).matches : false,
  );

  useEffect(() => {
    const media = window.matchMedia(NARROW_LAYOUT_QUERY);
    const apply = () => setNarrow(media.matches);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, []);

  return narrow;
}

/**
 * 桌面預設展開、窄螢幕預設收合。
 * 同一斷點內的手動切換會保留；跨過斷點後回到該寬度的預設。
 */
function useProductionPanelCollapsed(narrow: boolean): readonly [boolean, () => void] {
  const [manual, setManual] = useState<{ narrow: boolean; collapsed: boolean } | null>(null);
  const collapsed = manual !== null && manual.narrow === narrow ? manual.collapsed : narrow;
  const toggle = () => setManual({ narrow, collapsed: !collapsed });
  return [collapsed, toggle];
}

export interface ProductionPanelProps {
  state: WorldState;
  selectedParcelId: ParcelId | null;
  onStop: (parcelId: ParcelId) => void;
  onInstallMachine: (parcelId: ParcelId, machineGradeId: MachineGradeId) => void;
  onAdvanceProduction: () => void;
  onDemolish: (parcelId: ParcelId) => void;
}

function formatProfit(value: number): string {
  return value.toLocaleString('zh-Hant', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
}

function lineStatusZh(status: ProductionStatus): string {
  switch (status) {
    case 'running':
      return '運轉中';
    case 'waiting_inputs':
      return '待料';
    case 'stopped':
      return '已停止';
    default: {
      const unreachable: never = status;
      return unreachable;
    }
  }
}

export function ProductionPanel({
  state,
  selectedParcelId,
  onStop,
  onInstallMachine,
  onAdvanceProduction,
  onDemolish,
}: ProductionPanelProps) {
  const narrow = useNarrowLayout();
  const [collapsed, toggleCollapsed] = useProductionPanelCollapsed(narrow);
  const bodyId = useId();
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
  const logisticsView =
    parcel && site?.phase === 'complete'
      ? getSiteLogisticsView(state.map, parcel, site, state.sites)
      : null;
  const locationBonus = logisticsView?.locationBonus ?? 0;
  const stageName = CHAIN_STAGES.find((entry) => entry.stage === stage)?.nameZh ?? '開採';
  const foldSummary = line
    ? `${stageName} · ${lineStatusZh(line.status)}`
    : `技術階段 · ${stageName}`;
  const foldLabel = collapsed ? `展開產線與技術，${foldSummary}` : '收合產線與技術';

  return (
    <section className={`sys-panel production-panel${collapsed ? ' is-collapsed' : ''}`}>
      <header className="sys-panel-head">
        <h2 className="production-fold-heading">
          <button
            type="button"
            className="production-fold"
            aria-expanded={!collapsed}
            aria-controls={bodyId}
            aria-label={foldLabel}
            onClick={toggleCollapsed}
          >
            <span className="sys-panel-tag">MFG</span>
            <span className="production-fold-title">
              產線與技術{parcel ? ` · (${parcel.x},${parcel.y})` : ''}
            </span>
            <span className="production-fold-action">
              <span className="production-fold-chevron" aria-hidden="true" />
              {collapsed ? '展開' : '收合'}
            </span>
            {collapsed ? <span className="production-fold-status">{foldSummary}</span> : null}
          </button>
        </h2>
      </header>
      <div id={bodyId} className="production-panel-body" hidden={collapsed}>
        <details className="unlock-chain">
          <summary>可解鎖 · {stageName}</summary>
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
                        {recipe.researchId ? ' · 需研發' : ''}
                        {recipe.minTechStage === 0 && recipe.stage === 'finish' ? ' · 捷徑' : ''}
                        {' · '}
                        短路程名目每刻{' '}
                        {Math.round(nominalProfitPerTick(recipe)).toLocaleString('zh-Hant')}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
          <p className="sys-muted chain-note">
            短路程名目每刻是開採 &lt; 加工 &lt; 成品。離供應樞紐 (0,0)
            愈遠，加工溢價掉得愈快，賣礦會反超。加工機不改產品，只改速度、產量與維護。煤炭、銅礦、石英砂粒可直接賣給港區。鐵錠、銅錠、矽片要再加工；合金板要組裝廠。
          </p>
        </details>

        {!isFactory || !parcel || !site || site.phase !== 'complete' || !demand ? (
          <p className="sys-muted">點完工工廠。可做的配方在地圖旁的規劃卡，一鍵開工。</p>
        ) : (
          <>
            <ParcelResourceBadge resource={parcel.resource} variant="prominent" />
            <p className="panel-hint">
              區位 +{locationBonus.toFixed(2)}（道路 {Math.round(parcel.roadAccess * 100)}% · 城市{' '}
              {Math.round(parcel.cityProximity * 100)}%）· 在此收購每週 {demand.weeklyVolume}{' '}
              件，單價 ${demand.unitPrice.toLocaleString()}
            </p>
            {line && activeRecipe ? (
              <>
                <p className="sys-muted">
                  生產中：{activeRecipe.nameZh} · {FACTORY_TYPES[site.factoryTypeId].nameZh}
                  {line.machineGradeId ? ` · ${MACHINE_GRADES[line.machineGradeId].nameZh}` : ''}
                  {line.pathGated ? ' · 路程超過門檻' : ''}
                </p>
                <p className="panel-hint">
                  {chainMarginCue(
                    activeRecipe,
                    planProfitPerTick(activeRecipe, line.cycleTicks, line.throughputFactor),
                    projectLine(
                      RECIPES['extract-iron'],
                      parcel,
                      logisticsView?.factor ?? 1,
                      null,
                      1,
                    ).profitPerTick,
                  )}
                </p>
                {activeRecipe.stage !== 'extract' ? (
                  <MachineCompare
                    compact
                    selected={line.machineGradeId}
                    cash={(state.players[playerId]?.cash ?? 0) + (line.machinePaid ?? 0)}
                    profitPerTick={Object.fromEntries(
                      (['anvil-bench', 'balance-press', 'neighbor-kiln'] as const).map((grade) => [
                        grade,
                        projectLine(
                          activeRecipe,
                          parcel,
                          logisticsView?.factor ?? 1,
                          grade,
                          line.localResourceBonus,
                        ).profitPerTick,
                      ]),
                    )}
                    onSelect={(grade) => onInstallMachine(parcel.id, grade)}
                  />
                ) : null}
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
                      {line.status === 'running' &&
                        line.phase === 'traveling' &&
                        '趕路（抵達後才作業）'}
                      {line.status === 'running' && line.phase === 'working' && '作業中'}
                      {line.status === 'waiting_inputs' && '待料閒置（移動暫停）'}
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
                    <dt>規劃利潤（含路程）</dt>
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
                <p className="sys-muted">
                  模擬時間會自動推進這條產線。換配方要先停止，再從規劃卡開工。
                </p>
                <div className="sys-btn-row">
                  {state.clock.paused ? (
                    <button type="button" className="sys-btn" onClick={onAdvanceProduction}>
                      暫停中前進一步
                    </button>
                  ) : null}
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
              <p className="sys-muted">
                配方在地圖旁的規劃卡：趕路刻、作業刻、規劃利潤，點一下就開工。
              </p>
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
        {!line && state.clock.paused ? (
          <button type="button" className="sys-btn chain-advance" onClick={onAdvanceProduction}>
            暫停中前進一步
          </button>
        ) : null}
      </div>
    </section>
  );
}
