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
        <li><span>營收</span><span>+${pnl.revenue.toLocaleString()}</span></li>
        <li><span>土地稅</span><span>-${pnl.taxPaid.toLocaleString()}</span></li>
        <li><span>維護費</span><span>-${pnl.maintenance.toLocaleString()}</span></li>
        <li><span>運輸</span><span>-${pnl.transportCost.toLocaleString()}</span></li>
        <li><span>拍賣支出</span><span>-${pnl.auctionSpend.toLocaleString()}</span></li>
        <li><span>建造支出</span><span>-${pnl.buildSpend.toLocaleString()}</span></li>
        <li><span>生產閒置損失</span><span>-${pnl.productionIdleLoss.toLocaleString()}</span></li>
      </ul>
      <p className="pnl-goal">
        目標淨利 ${target.toLocaleString()} · 第 {state.gameDay}/{state.scenario.config.maxDays} 天
      </p>
      {state.scenario.status === 'won' && <p className="pnl-win">已達標 — 產業霸權起步成功！</p>}
      {state.scenario.status === 'lost' && <p className="pnl-lose">未達標 — 可調整佈局再試</p>}
    </section>
  );
}
