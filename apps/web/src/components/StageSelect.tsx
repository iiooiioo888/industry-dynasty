import {
  STAGES,
  isStageUnlocked,
  type CampaignProgress,
  type StageDef,
} from '@industry-dynasty/sim';
import './StageSelect.css';

export interface StageSelectProps {
  progress: CampaignProgress;
  currentStageId: string | null;
  onPick: (stage: StageDef) => void;
  onClose: () => void;
}

const DIFFICULTY_LABEL: Record<number, string> = {
  1: '入門',
  2: '進階',
  3: '熟練',
  4: '老手',
  5: '嚴苛',
};

/**
 * 關卡選擇。
 *
 * 22 關排成年代分組的清單：已通關的可以重玩、下一關可以挑戰、
 * 其餘鎖住。這樣「跨局推進」才有進度感，而不是只能線性往下走。
 */
export function StageSelect({ progress, currentStageId, onPick, onClose }: StageSelectProps) {
  const cleared = new Set(progress.clearedStageIds);

  return (
    <div className="stage-select" role="dialog" aria-modal="true">
      <div className="stage-select-card">
        <header>
          <h2>選擇關卡</h2>
          <span className="stage-select-progress">
            已通關 {cleared.size} / {STAGES.length}
          </span>
          <button type="button" className="stage-select-close" onClick={onClose}>
            關閉
          </button>
        </header>

        <ul className="stage-list">
          {STAGES.map((stage) => {
            const unlocked = isStageUnlocked(progress, stage.id);
            const done = cleared.has(stage.id);
            const current = stage.id === currentStageId;
            return (
              <li
                key={stage.id}
                className={[
                  'stage-item',
                  unlocked ? 'is-unlocked' : 'is-locked',
                  done ? 'is-done' : '',
                  current ? 'is-current' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <button
                  type="button"
                  disabled={!unlocked}
                  onClick={() => onPick(stage)}
                  title={unlocked ? stage.briefing : '先通過前一關'}
                >
                  <span className="stage-no">{String(stage.index).padStart(2, '0')}</span>
                  <span className="stage-name">{stage.nameZh}</span>
                  <span className="stage-era">{stage.eraLabel}</span>
                  <span className="stage-diff">{DIFFICULTY_LABEL[stage.difficulty] ?? ''}</span>
                  <span className="stage-mark">{done ? '✔' : unlocked ? '▶' : '🔒'}</span>
                </button>
              </li>
            );
          })}
        </ul>

        <p className="stage-select-hint">通關一關就會解鎖下一關。難度與目標會隨年代提高。</p>
      </div>
    </div>
  );
}
