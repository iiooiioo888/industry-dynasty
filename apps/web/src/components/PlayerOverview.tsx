import { getPlayerHoldings, type WorldState } from '@industry-dynasty/sim';
import './PlayerOverview.css';

export interface PlayerOverviewProps {
  state: WorldState;
  onAdvanceTax: () => void;
}

export function PlayerOverview({ state, onAdvanceTax }: PlayerOverviewProps) {
  const player = state.players[state.localPlayerId];
  const holdings = getPlayerHoldings(state, player.id);

  return (
    <section className="panel overview-panel">
      <h2>資產總覽</h2>
      <p className="cash-line">
        現金 <strong>${player.cash.toLocaleString()}</strong>
      </p>
      <p className="meta-line">稅務週期：第 {state.taxTick} 期</p>
      <button type="button" className="tax-btn" onClick={onAdvanceTax}>
        推進稅務週期
      </button>
      <h3>持有土地 ({holdings.length})</h3>
      {holdings.length === 0 ? (
        <p className="panel-muted">尚無土地，請從拍賣取得。</p>
      ) : (
        <ul className="holdings-list">
          {holdings.map((p) => (
            <li key={p.id.value}>
              ({p.x}, {p.y})
              {state.unpaidLandTax[p.id.value]
                ? ` · 欠稅 $${state.unpaidLandTax[p.id.value].toLocaleString()}`
                : ''}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
