import { getPlayerHoldings, quoteLocalDemand, type WorldState } from '@industry-dynasty/sim';
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
        現金{' '}
        <strong>
          $<AnimatedNumber value={player.cash} />
        </strong>
      </p>
      <p className="panel-hint">日結跟標題列倒數走。歸零時一次扣土地稅、計息，並收工廠維護。</p>
      <h3>持有土地 ({holdings.length})</h3>
      {holdings.length === 0 ? (
        <p className="panel-muted">尚無土地，請從拍賣取得。</p>
      ) : (
        <ul className="holdings-list">
          {holdings.map((p) => {
            const quote = quoteLocalDemand(p);
            return (
              <li key={p.id.value}>
                ({p.x}, {p.y}) · 人口 {p.populationDensity} · ${quote.unitPrice}/件 ·{' '}
                {quote.weeklyVolume}
                件/週
                {state.unpaidLandTax[p.id.value]
                  ? ` · 欠稅 $${state.unpaidLandTax[p.id.value].toLocaleString()}`
                  : ''}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
