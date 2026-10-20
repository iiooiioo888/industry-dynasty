import {
  CAMPAIGN_COST,
  CONSUMER_RESEARCH_ID,
  RESEARCH_COST,
  STAFF_TABLE,
  readCommerce,
  type ParcelId,
  type StaffRole,
  type WorldState,
} from '@industry-dynasty/sim';
import './OpsPanel.css';

export interface OpsPanelProps {
  state: WorldState;
  onHire: (role: StaffRole, count: number) => void;
  onFire: (role: StaffRole, count: number) => void;
  onResearch: (parcelId: ParcelId) => void;
  onCampaign: (cityId: string) => void;
}

const ROLES: readonly StaffRole[] = ['operator', 'clerk', 'researcher'];

export function OpsPanel({ state, onHire, onFire, onResearch, onCampaign }: OpsPanelProps) {
  const commerce = readCommerce(state);
  const player = state.players[state.localPlayerId];
  const lab = Object.entries(state.sites).find(
    ([, site]) =>
      site.phase === 'complete' &&
      site.ownerId === state.localPlayerId &&
      site.factoryTypeId === 'lab',
  );
  const labId = lab ? { value: lab[0] } : null;
  const unlocked = commerce.unlocked.includes(CONSUMER_RESEARCH_ID);
  const counts: Record<StaffRole, number> = {
    operator: commerce.staff.operators,
    clerk: commerce.staff.clerks,
    researcher: commerce.staff.researchers,
  };

  return (
    <section className="sys-panel ops-panel">
      <header className="sys-panel-head">
        <span className="sys-panel-tag">OPS</span>
        <h2>經營</h2>
      </header>
      <ul className="ops-staff">
        {ROLES.map((role) => {
          const spec = STAFF_TABLE[role];
          const affordable = (player?.cash ?? 0) >= spec.hireCost;
          return (
            <li key={role}>
              <strong>{spec.nameZh}</strong>
              <span>
                {counts[role]} 人 · 日薪 ${spec.dailyWage} · 聘僱 ${spec.hireCost}
              </span>
              <span className="ops-actions">
                <button type="button" disabled={!affordable} onClick={() => onHire(role, 1)}>
                  聘
                </button>
                <button type="button" disabled={counts[role] <= 0} onClick={() => onFire(role, 1)}>
                  辭
                </button>
              </span>
            </li>
          );
        })}
      </ul>
      <div className="ops-block">
        <h3>研發</h3>
        {unlocked ? null : commerce.research ? (
          <p className="sys-muted">
            {commerce.research.progressTicks}/{commerce.research.totalTicks}
          </p>
        ) : (
          <button
            type="button"
            className="sys-btn"
            disabled={!labId || (player?.cash ?? 0) < RESEARCH_COST}
            onClick={() => labId && onResearch(labId)}
          >
            ${RESEARCH_COST.toLocaleString()}
          </button>
        )}
      </div>
      <div className="ops-block">
        <h3>廣告</h3>
        <ul className="ops-staff">
          {state.map.cities.map((city) => {
            const live = commerce.campaigns.find((campaign) => campaign.cityId === city.id);
            return (
              <li key={city.id}>
                <strong>{city.name}</strong>
                <span>{live ? `剩餘 ${live.remainingDays} 天` : `$${CAMPAIGN_COST.toLocaleString()}`}</span>
                <button
                  type="button"
                  disabled={(player?.cash ?? 0) < CAMPAIGN_COST}
                  onClick={() => onCampaign(city.id)}
                >
                  投放
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
