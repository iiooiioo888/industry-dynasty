import {
  CAMPAIGN_COST,
  CONSUMER_RESEARCH_ID,
  FACTORY_TYPES,
  RESEARCH_COST,
  RESEARCH_TICKS,
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
      <p className="sys-muted">
        不聘技師時產線維持原產量。聘了之後，人數要蓋得過正在跑的產線，否則產量下降。門市沒有店員賣不動。研發員不足時研究停滯。
      </p>
      <div className="ops-block">
        <h3>研發</h3>
        {unlocked ? (
          <p className="sys-muted">消費品產線已解鎖，品質提高售價並略拉長週期。</p>
        ) : commerce.research ? (
          <p className="sys-muted">
            消費品產線 {commerce.research.progressTicks}/{commerce.research.totalTicks || RESEARCH_TICKS}{' '}
            刻
            {commerce.staff.researchers < 1 ? ' · 等待研發員' : ''}
          </p>
        ) : (
          <button
            type="button"
            className="sys-btn"
            disabled={!labId || (player?.cash ?? 0) < RESEARCH_COST}
            onClick={() => labId && onResearch(labId)}
          >
            {labId ? `開始研發（$${RESEARCH_COST.toLocaleString()}）` : '先蓋研發室'}
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
      <div className="ops-block">
        <h3>新聞</h3>
        {commerce.events.length === 0 ? (
          <p className="sys-muted">今天沒有特別的市場消息。</p>
        ) : (
          <ul className="ops-news">
            {commerce.events.map((event) => (
              <li key={event.id}>
                {event.headline}
                <span>剩餘 {event.remainingDays} 天</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="sys-muted">
        建築：{FACTORY_TYPES.storefront.nameZh}、{FACTORY_TYPES.lab.nameZh} 不跑產線。
      </p>
    </section>
  );
}
