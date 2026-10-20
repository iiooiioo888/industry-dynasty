import {
  craftedValue,
  emptyPnL,
  marketShareOf,
  netProfit,
  readCommerce,
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
  const commerce = readCommerce(state);
  const progress = scenarioProgress(state.scenario, pnl, {
    craftedValue: myCraftedValue,
    commerce: {
      share: marketShareOf(commerce),
      consumerRevenue: commerce.consumerRevenue,
    },
  });
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
        <li>
          <span>薪資</span>
          <span>-${(pnl.wages ?? 0).toLocaleString()}</span>
        </li>
      </ul>
      {/* 兩條互斥的勝利路線，任一整條達成即通關。
          工業化要求「賺得到錢」且「真的把原料變成產品」；
          商業要求「開門市賣到足夠營收」且「吃下城市需求佔比」。
          純挖礦轉賣兩條都走不通。 */}
      <div className="pnl-goals">
        <p className="pnl-route">
          路線一 · 工業化 {progress.profitMet && progress.craftedMet ? '✓' : ''}
        </p>
        <p className={progress.profitMet ? 'pnl-goal met' : 'pnl-goal'}>
          {progress.profitMet ? '✓' : '○'} 淨利 ${net.toLocaleString()} / $
          {config.targetNetProfit.toLocaleString()}
        </p>
        <p className={progress.craftedMet ? 'pnl-goal met' : 'pnl-goal'}>
          {progress.craftedMet ? '✓' : '○'} 加工產值 ${myCraftedValue.toLocaleString()} / $
          {config.targetCraftedValue.toLocaleString()}
        </p>
        <p className="pnl-route">
          路線二 · 商業 {progress.minRevenueMet && progress.shareMet ? '✓' : ''}
        </p>
        <p className={progress.minRevenueMet ? 'pnl-goal met' : 'pnl-goal'}>
          {progress.minRevenueMet ? '✓' : '○'} 消費營收 $
          {progress.commerce.consumerRevenue.toLocaleString()} / $
          {(config.minConsumerRevenue ?? 0).toLocaleString()}
        </p>
        <p className={progress.shareMet ? 'pnl-goal met' : 'pnl-goal'}>
          {progress.shareMet ? '✓' : '○'} 城市需求佔比 {(progress.commerce.share * 100).toFixed(1)}%
          / {((config.targetShare ?? 0) * 100).toFixed(0)}%
        </p>
        <p className="pnl-goal-hint">
          任一條路線整條達成即通關。只賣原料兩條都走不通 —— 必須加工或開通路。
        </p>
      </div>
      <p className="pnl-goal">
        第 {state.gameDay}/{config.maxDays} 天
      </p>
      {state.scenario.status === 'won' && <p className="pnl-win">已達標 — 產業霸權起步成功！</p>}
      {state.scenario.status === 'lost' && <p className="pnl-lose">未達標 — 可調整佈局再試</p>}
    </section>
  );
}
