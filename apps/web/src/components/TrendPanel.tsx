import { recentHistory, type WorldState } from '@industry-dynasty/sim';
import { TrendChart } from './TrendChart';
import './TrendPanel.css';

export interface TrendPanelProps {
  state: WorldState;
}

/**
 * 趨勢面板。
 *
 * 原本只有當下的數字（現金、淨利、市佔）。加上每日快照之後，
 * 玩家終於看得出「這幾天是在變好還是變壞」—— 這是經營遊戲最核心的回饋。
 */
export function TrendPanel({ state }: TrendPanelProps) {
  const history = recentHistory(state, 30);

  return (
    <section className="sys-panel trend-panel">
      <header className="sys-panel-head">
        <span className="sys-panel-tag">TRD</span>
        <h2>近 {Math.max(history.length, 0)} 日趨勢</h2>
      </header>
      <div className="trend-grid">
        <TrendChart history={history} metric="cash" label="現金" />
        <TrendChart history={history} metric="netProfit" label="累計淨利" />
        <TrendChart history={history} metric="consumerRevenue" label="消費營收" />
        <TrendChart history={history} metric="share" label="需求佔比" percent />
      </div>
      <p className="panel-hint">每天日結時記錄一次。數字全部來自模擬狀態，不是估算值。</p>
    </section>
  );
}
