import { getPlayerHoldings, quoteLocalDemand, type WorldState } from '@industry-dynasty/sim';
import './PlayerOverview.css';

export interface PlayerOverviewProps {
  state: WorldState;
  onAdvanceTax: () => void;
}

export function PlayerOverview({ state, onAdvanceTax }: PlayerOverviewProps) {
  const player = state.players[state.localPlayerId];
  const holdings = getPlayerHoldings(state, player.id);

  return (
    <section className="sys-panel overview-panel">
      <header className="sys-panel-head">
        <span className="sys-panel-tag">AST</span>
        <h2>資產總覽</h2>
      </header>
      <p className="cash-line">
        現金 <strong>${player.cash.toLocaleString()}</strong>
      </p>
      <p className="meta-line">
        生產週期：第 {state.productionTick} 期 · 銀行第 {state.financeTick} 期
      </p>
      <p className="panel-hint">結束本日會先扣土地稅與貸款，再對剩餘閒置現金計息。</p>
      <button type="button" className="sys-btn full" onClick={onAdvanceTax}>
        結束本日（稅務＋銀行＋維護＋刷新收購價）
      </button>
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
