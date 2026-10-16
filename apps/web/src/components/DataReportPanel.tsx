import {
  DEFAULT_SIMULATION,
  runDataReport,
  type DataReport,
  type ProfitBucket,
} from '@industry-dynasty/sim';
import { useEffect, useId, useRef, useState } from 'react';
import './DataReportPanel.css';

const MAX_GAMES = 200;

interface DataReportPanelProps {
  onClose: () => void;
}

export function DataReportPanel({ onClose }: DataReportPanelProps) {
  const gameCountId = useId();
  const titleId = useId();
  const generation = useRef(0);
  const timerRef = useRef<number | null>(null);
  const [gameCountInput, setGameCountInput] = useState(String(DEFAULT_SIMULATION.gameCount));
  const [seed, setSeed] = useState(DEFAULT_SIMULATION.seed);
  const [report, setReport] = useState<DataReport | null>(null);
  const [running, setRunning] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const publishReport = (gameCount: number, nextSeed: number) => {
    const runId = generation.current + 1;
    generation.current = runId;
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    setRunning(true);
    setError(null);
    timerRef.current = window.setTimeout(() => {
      if (generation.current !== runId) {
        return;
      }
      try {
        setReport(runDataReport({ gameCount, seed: nextSeed }));
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : '模擬失敗');
      } finally {
        if (generation.current === runId) {
          setRunning(false);
        }
      }
    }, 16);
  };

  useEffect(() => {
    publishReport(DEFAULT_SIMULATION.gameCount, DEFAULT_SIMULATION.seed);
    return () => {
      generation.current += 1;
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const rerun = () => {
    let gameCount: number;
    try {
      gameCount = parseGameCount(gameCountInput);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '局數不正確');
      return;
    }

    const nextSeed = seed + 1;
    setSeed(nextSeed);
    publishReport(gameCount, nextSeed);
  };

  return (
    <div className="report-shell" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <header className="report-topbar">
        <div>
          <p className="report-kicker">SYS / REPORT</p>
          <h2 id={titleId}>數據報表</h2>
        </div>
        <div className="report-controls">
          <label htmlFor={gameCountId}>局數</label>
          <input
            id={gameCountId}
            type="number"
            min={1}
            max={MAX_GAMES}
            inputMode="numeric"
            value={gameCountInput}
            onChange={(event) => setGameCountInput(event.target.value)}
          />
          <button type="button" className="report-run" onClick={rerun} disabled={running}>
            {running ? '模擬中…' : '重新模擬'}
          </button>
          <button type="button" className="report-close" onClick={onClose}>
            返回對局
          </button>
        </div>
      </header>

      <p className="report-tagline">空間效率 × 時間規劃 = 利潤</p>
      {error ? <p className="report-error">{error}</p> : null}

      {report ? (
        <div className="report-body" aria-busy={running}>
          <section className="metric-grid">
            <article className="metric-card">
              <h3>破產率</h3>
              <p className="metric-value">{formatPercent(report.bankruptcyRate)}</p>
              <p className="metric-note">
                {report.bankruptCount.toLocaleString('zh-TW')} /{' '}
                {report.observations.toLocaleString('zh-TW')} 位玩家
              </p>
              <p className="metric-note">期末現金為 0，且沒有完工工廠。</p>
            </article>

            <article className="metric-card">
              <h3>淨利</h3>
              <p className={`metric-value ${profitClass(report.netProfit.mean)}`}>
                {formatMoney(report.netProfit.mean)}
              </p>
              <p className="metric-note">平均現金淨利（期末現金 − 起始現金）</p>
              <dl className="quartile-row">
                <div>
                  <dt>最低</dt>
                  <dd>{formatMoney(report.netProfit.distribution.min)}</dd>
                </div>
                <div>
                  <dt>中位數</dt>
                  <dd>{formatMoney(report.netProfit.distribution.median)}</dd>
                </div>
                <div>
                  <dt>最高</dt>
                  <dd>{formatMoney(report.netProfit.distribution.max)}</dd>
                </div>
              </dl>
            </article>

            <article className="metric-card">
              <h3>壟斷傾向</h3>
              <p className="metric-value">{formatPercent(report.monopoly.tendency)}</p>
              <div
                className="share-track"
                role="meter"
                aria-label="平均最大產能份額"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(report.monopoly.tendency * 100)}
              >
                <span style={{ width: `${report.monopoly.tendency * 100}%` }} />
              </div>
              <p className="metric-note">
                平均最大產能份額。100% 表示每一局都由單一玩家掌握全部產能。
              </p>
              <p className="metric-note">
                赫芬達爾指數 {report.monopoly.meanHerfindahl.toFixed(3)} · 主導局佔比{' '}
                {formatPercent(report.monopoly.dominantGameRate)}
              </p>
            </article>
          </section>

          <section className="report-panel">
            <h3>淨利分布</h3>
            <p className="metric-note">
              第一四分位 {formatMoney(report.netProfit.distribution.p25)} · 第三四分位{' '}
              {formatMoney(report.netProfit.distribution.p75)} · 樣本{' '}
              {report.netProfit.distribution.sampleCount.toLocaleString('zh-TW')}
            </p>
            <Histogram buckets={report.netProfit.distribution.buckets} />
          </section>

          <section className="report-panel">
            <h3>策略對照</h3>
            <div className="strategy-table-wrap">
              <table className="strategy-table">
                <thead>
                  <tr>
                    <th>策略</th>
                    <th>觀察數</th>
                    <th>破產率</th>
                    <th>平均淨利</th>
                  </tr>
                </thead>
                <tbody>
                  {report.strategies.map((row) => (
                    <tr key={row.strategy}>
                      <td>{row.label}</td>
                      <td>{row.observations.toLocaleString('zh-TW')}</td>
                      <td>{formatPercent(row.bankruptcyRate)}</td>
                      <td className={profitClass(row.meanNetProfit)}>
                        {formatMoney(row.meanNetProfit)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <footer className="report-foot">
            模擬 {report.gameCount.toLocaleString('zh-TW')} 局 · 地圖 {report.parameters.mapWidth}×
            {report.parameters.mapHeight} · {report.parameters.horizon} 週期 · 起始現金{' '}
            {formatMoney(report.parameters.startingCash)} · 種子{' '}
            {report.seed.toLocaleString('zh-TW')}
            。產能＝基礎產出 ×
            物流效率；若該局沒有完工工廠，壟斷改以土地份額計算。此報表不改動目前對局。
          </footer>
        </div>
      ) : (
        <p className="report-pending">{running ? '正在跑模擬對局…' : '尚無報表'}</p>
      )}
    </div>
  );
}

function Histogram({ buckets }: { buckets: readonly ProfitBucket[] }) {
  if (buckets.length === 0) {
    return <p className="metric-note">沒有樣本。</p>;
  }
  const peak = Math.max(...buckets.map((bucket) => bucket.count));
  return (
    <div className="histogram" role="img" aria-label="淨利直方圖">
      {buckets.map((bucket, index) => (
        <div key={`${bucket.min}-${index}`} className="histogram-row">
          <div className="histogram-meta">
            <span className="histogram-label">{bucket.label}</span>
            <span className="histogram-count">{bucket.count.toLocaleString('zh-TW')}</span>
          </div>
          <div className="histogram-bar-track">
            <span
              className="histogram-bar"
              style={{ width: peak === 0 ? '0%' : `${(bucket.count / peak) * 100}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function parseGameCount(raw: string): number {
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < 1 || value > MAX_GAMES) {
    throw new Error(`局數須為 1 到 ${MAX_GAMES} 的整數`);
  }
  return value;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatMoney(value: number): string {
  const rounded = Math.round(value);
  const body = Math.abs(rounded).toLocaleString('zh-TW');
  return rounded < 0 ? `-$${body}` : `$${body}`;
}

function profitClass(value: number): string {
  if (value > 0) {
    return 'is-profit';
  }
  if (value < 0) {
    return 'is-loss';
  }
  return '';
}
