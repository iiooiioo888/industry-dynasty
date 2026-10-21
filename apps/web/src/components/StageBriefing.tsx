import { buildBriefing, type StageDef } from '@industry-dynasty/sim';
import './StageBriefing.css';

export interface StageBriefingProps {
  stage: StageDef;
  onStart: () => void;
}

/**
 * 關卡開場簡報。
 *
 * 原本按「選關」就直接進地圖，玩家看不出目標與規模。
 * 這裡在開局前停一下，把該知道的數字講清楚 —— 內容由
 * `guidance/briefing.ts` 產生（純函式，有測試）。
 */
export function StageBriefing({ stage, onStart }: StageBriefingProps) {
  const briefing = buildBriefing(stage);
  return (
    <div className="stage-briefing" role="dialog" aria-modal="true">
      <div className="stage-briefing-card">
        <header>
          <span className="stage-briefing-era">{briefing.era}</span>
          <h2>{briefing.title}</h2>
        </header>

        <p className="stage-briefing-opening">{briefing.opening}</p>

        <ul className="stage-briefing-lines">
          {briefing.lines.map((line) => (
            <li key={line.label} className={line.emphasis ? 'is-goal' : ''}>
              <span>{line.label}</span>
              <strong>{line.value}</strong>
            </li>
          ))}
        </ul>

        <p className="stage-briefing-focus">{briefing.focus}</p>

        <div className="stage-briefing-actions">
          <button type="button" className="primary" onClick={onStart}>
            開始這一關
          </button>
        </div>
      </div>
    </div>
  );
}
