import type { DaySnapshot } from '@industry-dynasty/sim';
import './TrendChart.css';

export interface TrendChartProps {
  history: readonly DaySnapshot[];
  /** 要畫哪個欄位 */
  metric: 'cash' | 'netProfit' | 'consumerRevenue' | 'share';
  label: string;
  /** 是否以百分比顯示 */
  percent?: boolean;
  height?: number;
}

/**
 * 趨勢走勢圖。
 *
 * 用純 SVG 手畫 —— 為了幾條折線再引入圖表函式庫並不划算，
 * 而且這裡只需要「一眼看出方向」。
 *
 * 設計重點：
 * - 自動縮放（min/max），因為現金從 10 萬掉到 2 萬的視覺幅度要看得出來
 * - 破了（只有 1 天）就畫一條水平線，不會出現空圖
 * - 尊重 `prefers-reduced-motion`：不做進場動畫
 */
export function TrendChart({
  history,
  metric,
  label,
  percent = false,
  height = 64,
}: TrendChartProps) {
  const values = history.map((snap) => snap[metric]);
  const width = 240;
  const padding = 2;

  if (values.length === 0) {
    return (
      <div className="trend-chart is-empty">
        <span className="trend-label">{label}</span>
        <span className="trend-empty">尚無資料（過一天就會有）</span>
      </div>
    );
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const stepX = values.length > 1 ? (width - padding * 2) / (values.length - 1) : 0;
  const points = values.map((value, index) => {
    const x = padding + index * stepX;
    const y = padding + (1 - (value - min) / span) * (height - padding * 2);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });
  const last = values[values.length - 1] ?? 0;
  const first = values[0] ?? 0;
  const rising = last >= first;
  const format = (value: number): string =>
    percent ? `${(value * 100).toFixed(1)}%` : `${Math.round(value).toLocaleString()}`;

  return (
    <div className="trend-chart">
      <div className="trend-head">
        <span className="trend-label">{label}</span>
        <span className={`trend-value ${rising ? 'is-up' : 'is-down'}`}>{format(last)}</span>
        <span className="trend-range">
          {format(min)} ～ {format(max)}
        </span>
      </div>
      <svg
        className={`trend-svg ${rising ? 'is-up' : 'is-down'}`}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        role="img"
        aria-label={`${label}趨勢，最近 ${values.length} 天`}
      >
        <polyline
          points={points.join(' ')}
          fill="none"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
        {values.length === 1 && <circle cx={padding} cy={height / 2} r="2" className="trend-dot" />}
      </svg>
    </div>
  );
}
