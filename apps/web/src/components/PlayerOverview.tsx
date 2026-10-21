import { getPlayerHoldings, type WorldState } from '@industry-dynasty/sim';
import { AnimatedNumber } from './AnimatedNumber';
import './PlayerOverview.css';

export interface PlayerOverviewProps {
  state: WorldState;
}

export function PlayerOverview({ state }: PlayerOverviewProps) {
  const player = state.players[state.localPlayerId];
  const holdings = getPlayerHoldings(state, player.id);

  return (
    <section className="sys-panel overview-panel">
      <header className="sys-panel-head">
        <span className="sys-panel-tag">AST</span>
        <h2>資產總覽</h2>
      </header>
      <p className="cash-line">
        <strong>
          $<AnimatedNumber value={player.cash} />
        </strong>
      </p>
      <h3>土地 {holdings.length}</h3>
      {holdings.length === 0 ? (
        <p className="panel-muted">還沒有地</p>
      ) : (
        <ul className="holdings-list">
          {holdings.map((p) => (
            <li key={p.id.value}>
              {p.x},{p.y} · 人口 {p.populationDensity}
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
