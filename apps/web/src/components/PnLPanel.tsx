import { emptyPnL, netProfit, type WorldState } from '@industry-dynasty/sim';
import './PnLPanel.css';

export interface PnLPanelProps {
  state: WorldState;
}

export function PnLPanel({ state }: PnLPanelProps) {
  const pnl = state.pnl[state.localPlayerId] ?? emptyPnL();
  const net = netProfit(pnl);
  const target = state.scenario.config.targetNetProfit;

  return (
    <section className="sys-panel pnl-panel">
      <header className="sys-panel-head">
        <span className="sys-panel-tag">P&L</span>
        <h2>損益報表</h2>
      </header>
      <p className="pnl-net">
        淨利 <strong className={net >= 0 ? 'pos' : 'neg'}>${net.toLocaleString()}</strong>
      </p>
      <ul className="pnl-lines">
        {pnl.revenue > 0 ? <li><span>營收</span><span>+${pnl.revenue.toLocaleString()}</span></li> : null}
        {pnl.taxPaid > 0 ? <li><span>地稅</span><span>-${pnl.taxPaid.toLocaleString()}</span></li> : null}
        {pnl.maintenance > 0 ? <li><span>維護</span><span>-${pnl.maintenance.toLocaleString()}</span></li> : null}
        {pnl.transportCost > 0 ? <li><span>運輸</span><span>-${pnl.transportCost.toLocaleString()}</span></li> : null}
        {pnl.auctionSpend > 0 ? <li><span>購地</span><span>-${pnl.auctionSpend.toLocaleString()}</span></li> : null}
        {pnl.buildSpend > 0 ? <li><span>建造</span><span>-${pnl.buildSpend.toLocaleString()}</span></li> : null}
        {pnl.productionIdleLoss > 0 ? (
          <li><span>閒置</span><span>-${pnl.productionIdleLoss.toLocaleString()}</span></li>
        ) : null}
      </ul>
      <p className="pnl-goal">
        目標 ${target.toLocaleString()} · {state.gameDay}/{state.scenario.config.maxDays} 天
      </p>
      {state.scenario.status === 'won' && <p className="pnl-win">已達標</p>}
      {state.scenario.status === 'lost' && <p className="pnl-lose">未達標</p>}
    </section>
  );
}
