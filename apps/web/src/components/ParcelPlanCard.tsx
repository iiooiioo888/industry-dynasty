import {
  FACTORY_TYPES,
  RECIPE_LIST,
  RECIPES,
  createProductionLine,
  findOpenLotForParcel,
  findParcel,
  getProductionLine,
  getSite,
  getSiteLogisticsView,
  minNextBid,
  planProfitPerTick,
  quoteParcelPlan,
  recipeBlockReason,
  validateBid,
  type Parcel,
  type ParcelId,
  type ParcelResourceKind,
  type RecipeId,
  type WorldState,
} from '@industry-dynasty/sim';
import { useState } from 'react';
import { BuildPanel } from './BuildPanel';
import './ParcelPlanCard.css';

const MAX_PINS = 3;
const MAX_RECIPES = 3;

export interface ParcelPlanCardProps {
  state: WorldState;
  selectedParcelId: ParcelId | null;
  pinnedIds: readonly string[];
  onTogglePin: (parcelId: ParcelId) => void;
  onBid: (parcelId: ParcelId, amount: number) => void;
  onSettle: (parcelId: ParcelId) => void;
  onStartBuild: ParcelPlanBuildProps['onStartBuild'];
  onCancelBuild: (parcelId: ParcelId) => void;
  onStartProduction: (parcelId: ParcelId, recipeId: RecipeId) => void;
  onStopProduction: (parcelId: ParcelId) => void;
}

type ParcelPlanBuildProps = {
  onStartBuild: (parcelId: ParcelId, factoryTypeId: 'workshop' | 'assembly-plant') => void;
};

function formatProfit(value: number): string {
  return value.toLocaleString('zh-Hant', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
}

function resourceNextStep(kind: ParcelResourceKind): string | null {
  switch (kind) {
    case 'copper-shale':
      return '下一步：挖出的銅礦可以直接賣給港區。煉成銅錠要煤炭，而且要先入庫原料解鎖技術。合金板要另建組裝廠，這座工坊做不到。';
    case 'coal-seam':
      return '下一步：煤炭可以直接出售，也是冶煉燃料。鐵錠、銅錠、矽片仍不能直接賣；合金板要組裝廠。';
    case 'quartz-sand':
      return '下一步：石英砂粒可以直接賣給港區。燒成矽片要煤炭與技術。合金板要另建組裝廠，這座工坊做不到。';
    default:
      return null;
  }
}

function parcelById(state: WorldState, id: string): Parcel | undefined {
  return state.map.parcels.find((parcel) => parcel.id.value === id);
}

export function ParcelPlanCard({
  state,
  selectedParcelId,
  pinnedIds,
  onTogglePin,
  onBid,
  onSettle,
  onStartBuild,
  onCancelBuild,
  onStartProduction,
  onStopProduction,
}: ParcelPlanCardProps) {
  const player = state.players[state.localPlayerId];
  const selected = selectedParcelId ? findParcel(state, selectedParcelId) : undefined;
  const columnIds: string[] = [];
  if (selected) {
    columnIds.push(selected.id.value);
  }
  for (const id of pinnedIds) {
    if (!columnIds.includes(id) && columnIds.length < MAX_PINS) {
      columnIds.push(id);
    }
  }
  const columns = columnIds
    .map((id) => parcelById(state, id))
    .filter((parcel): parcel is Parcel => parcel !== undefined);
  const lot = selected ? findOpenLotForParcel(state, selected.id) : undefined;
  const site = selected ? getSite(state, selected.id) : undefined;
  const line = selected ? getProductionLine(state, selected.id) : undefined;
  const owned = selected?.ownerId === state.localPlayerId;
  const buyable = Boolean(selected && selected.role === 'land' && !selected.ownerId && lot);
  const factoryReady = owned && site?.phase === 'complete' && selected?.state === 'building-ready';
  const price = lot ? (lot.highBidderId === player?.id ? lot.highBid : minNextBid(lot)) : 0;
  const canBuy = Boolean(player && buyable && player.cash >= price);
  const pinned = selected ? pinnedIds.includes(selected.id.value) : false;

  function purchase(parcel: Parcel) {
    const open = findOpenLotForParcel(state, parcel.id);
    if (!open) {
      return;
    }
    if (open.highBidderId !== state.localPlayerId) {
      onBid(parcel.id, minNextBid(open));
    }
    onSettle(parcel.id);
  }

  return (
    <section className="sys-panel parcel-plan" aria-label="規劃" data-plan-card="true">
      <header className="sys-panel-head">
        <span className="sys-panel-tag">PLAN</span>
        <h2>規劃</h2>
      </header>
      {!selected ? (
        <p className="sys-muted">點地圖上的地。這張卡會並列到港、樞紐、人口、運費與土地稅。</p>
      ) : selected.role !== 'land' ? (
        <p className="sys-muted">
          {selected.role === 'road' ? '道路' : (selected.nearestCityName ?? '城市')}
          不出售。改選旁邊的地來比較。
        </p>
      ) : (
        <>
          <div className="plan-focus-row">
            <p className="sys-muted">
              ({selected.x},{selected.y}) · {selected.resource.nameZh}
            </p>
            <button type="button" className="secondary" onClick={() => onTogglePin(selected.id)}>
              {pinned ? '取消釘選' : '釘選比較'}
            </button>
          </div>
          {columns.length > 0 ? (
            <table className="plan-table">
              <thead>
                <tr>
                  <th>比較</th>
                  {columns.map((parcel) => (
                    <th
                      key={parcel.id.value}
                      className={
                        parcel.id.value === selected.id.value ? 'plan-col-focus' : undefined
                      }
                    >
                      ({parcel.x},{parcel.y})
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <PlanRow
                  label="到港距離"
                  columns={columns}
                  state={state}
                  pick={(quote) => `${quote.portDistance} 格`}
                />
                <PlanRow
                  label="到樞紐路程"
                  columns={columns}
                  state={state}
                  pick={(quote) => `${quote.hubSteps} 步`}
                />
                <PlanRow
                  label="人口密度"
                  columns={columns}
                  state={state}
                  pick={(quote) => `${quote.populationDensity}`}
                />
                <PlanRow
                  label="預估運費"
                  columns={columns}
                  state={state}
                  pick={(quote) => `$${quote.freightPerUnit}/件`}
                />
                <PlanRow
                  label="土地稅"
                  columns={columns}
                  state={state}
                  pick={(quote) => `$${quote.landTax}/日`}
                />
              </tbody>
            </table>
          ) : null}
          <p className="panel-hint">運費以基礎零件估算。釘選 2–3 格，先比再買。</p>
          {resourceNextStep(selected.resource.kind) ? (
            <p className="panel-hint">{resourceNextStep(selected.resource.kind)}</p>
          ) : null}
          {buyable && lot && player ? (
            <AuctionBidBox
              key={`${selected.id.value}-${minNextBid(lot)}`}
              lotMin={lot.minPrice}
              nextBid={minNextBid(lot)}
              price={price}
              canBuy={canBuy}
              onPurchase={() => purchase(selected)}
              onSubmit={(amount) => {
                const validation = validateBid(lot, player, amount);
                if (!validation.ok) {
                  return validation.reason ?? '出價沒有送出。';
                }
                onBid(selected.id, amount);
                return null;
              }}
              onSettle={() => {
                if (!lot.highBidderId || lot.highBid < lot.minPrice) {
                  return '沒有有效出價，拍賣維持開放，礦點不會關閉。';
                }
                if (lot.highBidderId !== player.id || player.cash < lot.highBid) {
                  return '得標現金不足，拍賣維持開放，礦點不會關閉。';
                }
                onSettle(selected.id);
                return null;
              }}
            />
          ) : null}
          {owned ? (
            <BuildPanel
              state={state}
              selectedParcelId={selectedParcelId}
              onStartBuild={onStartBuild}
              onCancelBuild={onCancelBuild}
            />
          ) : null}
          {factoryReady && selected && site?.phase === 'complete' ? (
            <FactorySchedule
              state={state}
              parcel={selected}
              factoryTypeId={site.factoryTypeId}
              line={line}
              onStart={onStartProduction}
              onStop={onStopProduction}
            />
          ) : null}
        </>
      )}
    </section>
  );
}

function AuctionBidBox({
  lotMin,
  nextBid,
  price,
  canBuy,
  onPurchase,
  onSubmit,
  onSettle,
}: {
  lotMin: number;
  nextBid: number;
  price: number;
  canBuy: boolean;
  onPurchase: () => void;
  onSubmit: (amount: number) => string | null;
  onSettle: () => string | null;
}) {
  const [draft, setDraft] = useState(String(nextBid));
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="plan-bid-box">
      <button type="button" className="sys-btn full" disabled={!canBuy} onClick={onPurchase}>
        以 ${price.toLocaleString('zh-TW')} 購入
      </button>
      <div className="plan-bid">
        <label>
          出價
          <input
            type="number"
            min={lotMin}
            step={1}
            inputMode="numeric"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="sys-btn secondary"
          onClick={() => {
            const amount = Number.parseInt(draft, 10);
            if (!Number.isInteger(amount)) {
              setError('請輸入整數出價。這筆沒有送出。');
              return;
            }
            setError(onSubmit(amount));
          }}
        >
          送出出價
        </button>
        <button type="button" className="sys-btn secondary" onClick={() => setError(onSettle())}>
          結算拍賣
        </button>
      </div>
      <p className="panel-hint">
        底價 ${lotMin.toLocaleString('zh-TW')}。沒有達到底價的結算不會關礦。
      </p>
      {error ? (
        <p className="plan-alert" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function PlanRow({
  label,
  columns,
  state,
  pick,
}: {
  label: string;
  columns: readonly Parcel[];
  state: WorldState;
  pick: (quote: ReturnType<typeof quoteParcelPlan>) => string;
}) {
  const focus = columns[0]?.id.value;
  return (
    <tr>
      <th>{label}</th>
      {columns.map((parcel) => (
        <td
          key={parcel.id.value}
          className={parcel.id.value === focus ? 'plan-col-focus' : undefined}
        >
          {pick(quoteParcelPlan(state, parcel))}
        </td>
      ))}
    </tr>
  );
}

function FactorySchedule({
  state,
  parcel,
  factoryTypeId,
  line,
  onStart,
  onStop,
}: {
  state: WorldState;
  parcel: Parcel;
  factoryTypeId: 'workshop' | 'assembly-plant';
  line: ReturnType<typeof getProductionLine>;
  onStart: (parcelId: ParcelId, recipeId: RecipeId) => void;
  onStop: (parcelId: ParcelId) => void;
}) {
  const site = getSite(state, parcel.id);
  const active = line && line.status !== 'stopped' ? RECIPES[line.recipeId] : undefined;
  if (!site || site.phase !== 'complete') {
    return null;
  }
  if (active && line) {
    const travelDone = line.progressTicks >= line.travelTicks;
    return (
      <div className="plan-schedule">
        <h3>排產 · {FACTORY_TYPES[factoryTypeId].nameZh}</h3>
        <p className="sys-muted">
          {active.nameZh} ·{' '}
          {line.status === 'waiting_inputs' ? '待料' : travelDone ? '作業' : '趕路'}{' '}
          {line.progressTicks}/{line.cycleTicks}
        </p>
        <button type="button" className="sys-btn secondary full" onClick={() => onStop(parcel.id)}>
          停止這條產線
        </button>
      </div>
    );
  }

  const logistics = getSiteLogisticsView(state.map, parcel, site, state.sites);
  const crafted = state.craftedTotals[state.localPlayerId];
  const options = RECIPE_LIST.filter((recipe) => {
    if (!(recipe.buildings as readonly string[]).includes(factoryTypeId)) {
      return false;
    }
    if (recipe.sourceKind && recipe.sourceKind !== parcel.resource.kind) {
      return false;
    }
    return !recipeBlockReason({
      recipe,
      resourceKind: parcel.resource.kind,
      factoryTypeId,
      crafted,
    });
  })
    .map((recipe) => {
      const preview = createProductionLine(recipe, parcel, logistics.factor);
      const travel = preview.travelTicks;
      return {
        recipe,
        travel,
        work: Math.max(0, preview.cycleTicks - travel),
        factor: preview.throughputFactor,
        profit: planProfitPerTick(recipe, preview.cycleTicks, preview.throughputFactor),
      };
    })
    .sort((a, b) => b.profit - a.profit || a.recipe.id.localeCompare(b.recipe.id))
    .slice(0, MAX_RECIPES);

  return (
    <div className="plan-schedule">
      <h3>排產 · {FACTORY_TYPES[factoryTypeId].nameZh}</h3>
      {options.length === 0 ? (
        <p className="sys-muted">這座廠現在沒有可開工的配方。技術鏈收在右側「可解鎖」。</p>
      ) : (
        <ul className="plan-recipes">
          {options.map((option) => (
            <li key={option.recipe.id}>
              <button
                type="button"
                className="sys-btn block"
                onClick={() => onStart(parcel.id, option.recipe.id)}
              >
                {option.recipe.nameZh}
                <span className="recipe-io">
                  趕路 {option.travel} 刻 · 作業 {option.work} 刻 · 係數{' '}
                  {Math.round(option.factor * 100)}% · 規劃利潤（含路程）{' '}
                  {formatProfit(option.profit)}
                  /週期
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
