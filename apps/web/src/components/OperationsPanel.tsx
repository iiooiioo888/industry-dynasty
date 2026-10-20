import {
  AD_POINT_COST,
  CONSUMER_ITEM_IDS,
  FACTORY_TYPES,
  ITEMS,
  RESEARCH_PROJECT_LIST,
  STAFF_ROSTER,
  brandOf,
  hasCompletedLab,
  listStaff,
  quoteStoreItem,
  readResearch,
  readRivals,
  retailQuality,
  rivalShareForCity,
  shelfUnitPrice,
  shopkeeperSkillAt,
  type ConsumerItemId,
  type ParcelId,
  type WorldState,
} from '@industry-dynasty/sim';
import { useState } from 'react';
import './OperationsPanel.css';

export interface OperationsPanelProps {
  state: WorldState;
  onHire: (candidateId: string) => void;
  onDismiss: (staffId: string) => void;
  onAssign: (staffId: string, parcelId: ParcelId | null) => void;
  onUnlock: (projectId: string) => void;
  onSetPrice: (parcelId: ParcelId, itemId: ConsumerItemId, unitPrice: number) => void;
  onBuyAd: (spend: number) => void;
}

export function OperationsPanel({
  state,
  onHire,
  onDismiss,
  onAssign,
  onUnlock,
  onSetPrice,
  onBuyAd,
}: OperationsPanelProps) {
  const playerId = state.localPlayerId;
  const cash = state.players[playerId]?.cash ?? 0;
  const staff = listStaff(state);
  const research = readResearch(state);
  const rivals = readRivals(state.rivals, state.map.cities);
  const event = state.todayEvent;
  const [adSpend, setAdSpend] = useState(AD_POINT_COST);
  const hiredIds = new Set(staff.map((person) => person.candidateId));
  const seats = Object.entries(state.sites)
    .filter(([, site]) => site.phase === 'complete' && site.ownerId === playerId)
    .map(([key, site]) => {
      const parcel = state.map.parcels.find((entry) => entry.id.value === key);
      return parcel ? { parcel, site } : null;
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  return (
    <section className="sys-panel ops-panel">
      <header className="sys-panel-head">
        <span className="sys-panel-tag">OPS</span>
        <h2>經營</h2>
      </header>
      <p className="panel-hint">
        {event ? `${event.titleZh}。${event.detailZh}` : '今日還沒有事件。'} 品牌 {brandOf(state)}{' '}
        點，日結衰減兩成。未聘人、未蓋店時，這頁不扣錢。
      </p>

      <h3>人事</h3>
      <ul className="ops-list">
        {STAFF_ROSTER.map((candidate) => {
          const hired = staff.find((person) => person.candidateId === candidate.id);
          return (
            <li key={candidate.id}>
              <strong>{candidate.nameZh}</strong>
              <span className="panel-muted">
                {' '}
                {roleLabel(candidate.role)} · 技能 {candidate.skill} · 日薪 $
                {candidate.wagePerDay.toLocaleString()}
              </span>
              {hired ? (
                <div className="ops-row">
                  <label>
                    指派
                    <select
                      value={hired.assignedParcelId ?? ''}
                      onChange={(change) => {
                        const value = change.target.value;
                        onAssign(hired.id, value ? { value } : null);
                      }}
                    >
                      <option value="">未指派</option>
                      {seats
                        .filter(
                          (seat) => FACTORY_TYPES[seat.site.factoryTypeId].kind === kindFor(candidate.role),
                        )
                        .map((seat) => (
                          <option key={seat.parcel.id.value} value={seat.parcel.id.value}>
                            ({seat.parcel.x},{seat.parcel.y}) {FACTORY_TYPES[seat.site.factoryTypeId].nameZh}
                          </option>
                        ))}
                    </select>
                  </label>
                  <button type="button" className="secondary" onClick={() => onDismiss(hired.id)}>
                    解僱
                  </button>
                </div>
              ) : (
                <button type="button" disabled={hiredIds.has(candidate.id)} onClick={() => onHire(candidate.id)}>
                  聘用
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <h3>研發</h3>
      <p className="panel-muted">
        點數 {research.points}
        {hasCompletedLab(state) ? '。研發室完工後，指派的研發員每刻加點。' : '。先蓋一間研發室。'}
      </p>
      <ul className="ops-list">
        {RESEARCH_PROJECT_LIST.map((project) => {
          const unlocked = research.unlocked.includes(project.id);
          return (
            <li key={project.id}>
              <strong>{project.nameZh}</strong>
              <span className="panel-muted">
                {' '}
                {project.cost} 點 · {project.blurb}
              </span>
              <button
                type="button"
                disabled={unlocked || research.points < project.cost || !hasCompletedLab(state)}
                onClick={() => onUnlock(project.id)}
              >
                {unlocked ? '已解鎖' : '解鎖配方'}
              </button>
            </li>
          );
        })}
      </ul>

      <h3>門市定價</h3>
      <ShelfDesk state={state} onSetPrice={onSetPrice} />

      <h3>廣告</h3>
      <p className="panel-muted">${AD_POINT_COST.toLocaleString()} 換 1 點品牌，只拉高門市量。</p>
      <div className="ops-row">
        <input
          type="number"
          min={AD_POINT_COST}
          step={AD_POINT_COST}
          value={adSpend}
          onChange={(change) => setAdSpend(Number(change.target.value))}
        />
        <button type="button" disabled={cash < adSpend || adSpend < AD_POINT_COST} onClick={() => onBuyAd(adSpend)}>
          投放
        </button>
      </div>

      <h3>對手市占</h3>
      <ul className="ops-list">
        {state.map.cities.map((city) => (
          <li key={city.id}>
            <strong>{city.name}</strong>
            <span className="panel-muted"> 門市配額被佔 {Math.round(rivalShareForCity(rivals, city.id) * 100)}%</span>
            <ul>
              {rivals.firms.map((firm) => (
                <li key={firm.id}>
                  {firm.nameZh}（{firm.focusZh}）{Math.round((firm.shareByCity[city.id] ?? 0) * 100)}%
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ShelfDesk({
  state,
  parcelId,
  onSetPrice,
}: {
  state: WorldState;
  parcelId?: ParcelId;
  onSetPrice: (parcelId: ParcelId, itemId: ConsumerItemId, unitPrice: number) => void;
}) {
  const playerId = state.localPlayerId;
  const unlocked = new Set(readResearch(state).unlocked);
  const stores = Object.entries(state.sites)
    .filter(([key, site]) => {
      if (parcelId && key !== parcelId.value) {
        return false;
      }
      return (
        site.phase === 'complete' &&
        site.ownerId === playerId &&
        FACTORY_TYPES[site.factoryTypeId].kind === 'store'
      );
    })
    .map(([key]) => state.map.parcels.find((parcel) => parcel.id.value === key))
    .filter((parcel): parcel is NonNullable<typeof parcel> => parcel !== undefined);

  if (stores.length === 0) {
    return <p className="panel-muted">人口夠密的自有地才能蓋門市。蓋好後在這裡定價。</p>;
  }

  const quality = retailQuality(state);
  const rivals = readRivals(state.rivals, state.map.cities);

  return (
    <ul className="ops-list">
      {stores.map((parcel) => {
        const city = state.map.cities.find((entry) => entry.name === parcel.nearestCityName);
        return (
          <li key={parcel.id.value}>
            <strong>
              ({parcel.x},{parcel.y}) {parcel.nearestCityName ?? '城外'}
            </strong>
            {CONSUMER_ITEM_IDS.map((itemId) => {
              const projectOk =
                (itemId === 'tool-kit' && unlocked.has('civic-tools')) ||
                (itemId === 'wire-spool' && unlocked.has('civic-wire')) ||
                (itemId === 'sealant-coat' && unlocked.has('civic-seal'));
              const price = shelfUnitPrice(state, parcel.id.value, itemId);
              const quote = quoteStoreItem({
                parcel,
                itemId,
                unitPrice: price,
                quality,
                brand: brandOf(state),
                rivals,
                shopkeeperSkill: shopkeeperSkillAt(state, parcel.id.value),
                retailMultiplier: state.todayEvent?.retailMultiplier ?? 1,
                cityId: city?.id ?? null,
              });
              return (
                <ShelfRow
                  key={itemId}
                  label={ITEMS[itemId].nameZh}
                  disabled={!projectOk}
                  price={price}
                  units={quote.units}
                  onCommit={(unitPrice) => onSetPrice(parcel.id, itemId, unitPrice)}
                />
              );
            })}
          </li>
        );
      })}
    </ul>
  );
}

function ShelfRow({
  label,
  price,
  units,
  disabled,
  onCommit,
}: {
  label: string;
  price: number;
  units: number;
  disabled: boolean;
  onCommit: (unitPrice: number) => void;
}) {
  const [draft, setDraft] = useState(String(price));
  return (
    <div className="ops-row">
      <span>
        {label}
        {disabled ? '（未解鎖）' : ` · 日結約 ${units} 件`}
      </span>
      <input
        type="number"
        min={1}
        value={draft}
        disabled={disabled}
        onChange={(change) => setDraft(change.target.value)}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => {
          const unitPrice = Number(draft);
          if (Number.isInteger(unitPrice) && unitPrice > 0) {
            onCommit(unitPrice);
          }
        }}
      >
        定價
      </button>
    </div>
  );
}

function roleLabel(role: string): string {
  if (role === 'foreman') {
    return '現場班長';
  }
  if (role === 'researcher') {
    return '研發員';
  }
  return '店長';
}

function kindFor(role: string): 'works' | 'lab' | 'store' {
  if (role === 'foreman') {
    return 'works';
  }
  if (role === 'researcher') {
    return 'lab';
  }
  return 'store';
}
