import {
  craftedValue,
  emptyPnL,
  netProfit,
  scenarioProgress,
  type WorldState,
} from '@industry-dynasty/sim';
import './PnLPanel.css';

export interface PnLPanelProps {
  state: WorldState;
}

export function PnLPanel({ state }: PnLPanelProps) {
  const pnl = state.pnl[state.localPlayerId] ?? emptyPnL();
  const net = netProfit(pnl);
  const myCraftedValue = craftedValue(state.craftedTotals[state.localPlayerId]);
  const progress = scenarioProgress(state.scenario, pnl, myCraftedValue);
  const config = state.scenario.config;

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
        <li>
          <span>營收</span>
          <span>+${pnl.revenue.toLocaleString()}</span>
        </li>
        <li>
          <span>土地稅</span>
          <span>-${pnl.taxPaid.toLocaleString()}</span>
        </li>
        <li>
          <span>維護費</span>
          <span>-${pnl.maintenance.toLocaleString()}</span>
        </li>
        <li>
          <span>運輸</span>
          <span>-${pnl.transportCost.toLocaleString()}</span>
        </li>
        <li>
          <span>拍賣支出</span>
          <span>-${pnl.auctionSpend.toLocaleString()}</span>
        </li>
        <li>
          <span>建造支出</span>
          <span>-${pnl.buildSpend.toLocaleString()}</span>
        </li>
        <li>
          <span>生產閒置損失</span>
          <span>-${pnl.productionIdleLoss.toLocaleString()}</span>
        </li>
      </ul>
      {/* 通關有兩個維度：賺得到錢，**而且**真的把原料變成產品。
          只挖礦轉賣的加工產值恆為 0，永遠不會達標。 */}
      <div className="pnl-goals">
        <p className={progress.profitMet ? 'pnl-goal met' : 'pnl-goal'}>
          {progress.profitMet ? '✓' : '○'} 淨利 ${net.toLocaleString()} / $
          {config.targetNetProfit.toLocaleString()}
        </p>
        <p className={progress.craftedMet ? 'pnl-goal met' : 'pnl-goal'}>
          {progress.craftedMet ? '✓' : '○'} 加工產值 ${myCraftedValue.toLocaleString()} / $
          {config.targetCraftedValue.toLocaleString()}
        </p>
        <p className="pnl-goal-hint">兩個目標都要達成。只賣原料無法通關 —— 必須真的加工。</p>
      </div>
      <p className="pnl-goal">
        第 {state.gameDay}/{config.maxDays} 天
      </p>
      {state.scenario.status === 'won' && <p className="pnl-win">已達標 — 產業霸權起步成功！</p>}
      {state.scenario.status === 'lost' && <p className="pnl-lose">未達標 — 可調整佈局再試</p>}
    </section>
  );
}
