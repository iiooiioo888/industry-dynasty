import { summarizeProduction, type WorldState } from '@industry-dynasty/sim';
import './ProductionStatusPanel.css';

export interface ProductionStatusPanelProps {
  state: WorldState;
}

/**
 * 產線狀態一覽。
 *
 * 原本要一座一座工廠點進去看才知道有沒有在跑。這裡把所有產線列出來，
 * 並標出「卡住的原因」—— 判斷邏輯在 `guidance/status.ts`（有測試）。
 */
export function ProductionStatusPanel({ state }: ProductionStatusPanelProps) {
  const summary = summarizeProduction(state);
  if (summary.lines.length === 0) {
    return null;
  }
  return (
    <section className="sys-panel production-status">
      <header className="sys-panel-head">
        <span className="sys-panel-tag">PRD</span>
        <h2>
          產線 {summary.running} 條運轉
          {summary.blocked > 0 ? ` · ${summary.blocked} 條卡住` : ''}
        </h2>
      </header>
      <ul>
        {summary.lines.map((line) => (
          <li key={line.parcelKey} className={`is-${line.blocker}`}>
            <span className="ps-recipe">{line.recipeName}</span>
            <span className="ps-factory">{line.factoryName}</span>
            <span className="ps-output">→ {line.outputItem}</span>
            <span className="ps-note">{line.note}</span>
            <span className="ps-runs">{line.completedRuns} 批</span>
          </li>
        ))}
      </ul>
      {summary.totalIdleLoss > 0 && (
        <p className="panel-hint">
          閒置累計損失 ${summary.totalIdleLoss.toLocaleString()} —— 多半是缺料或缺技師。
        </p>
      )}
    </section>
  );
}
