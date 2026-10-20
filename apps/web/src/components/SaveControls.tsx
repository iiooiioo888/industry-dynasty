import type { SaveControls, SoundControls } from '../game/useWorldState';
import './SaveControls.css';

export interface SaveControlsProps {
  saves: SaveControls;
  sound: SoundControls;
  onOpenStages: () => void;
  clearedStages: number;
  totalStages: number;
}

export function SaveControlsBar({
  saves,
  sound,
  onOpenStages,
  clearedStages,
  totalStages,
}: SaveControlsProps) {
  return (
    <div className="save-controls">
      <button type="button" className="stage-select-open" onClick={onOpenStages} title="選擇關卡">
        選關（{clearedStages}/{totalStages}）
      </button>
      <button type="button" onClick={saves.save} title="把目前進度存到這個瀏覽器">
        存檔
      </button>
      <button type="button" onClick={saves.load} title="讀取上次存的進度">
        讀檔
      </button>
      <button type="button" className="save-reset" onClick={saves.reset} title="清除存檔並重新開局">
        新局
      </button>
      <button
        type="button"
        className="sound-toggle"
        onClick={sound.toggleMute}
        title={sound.muted ? '開啟音效' : '關閉音效'}
        aria-pressed={!sound.muted}
      >
        {sound.muted ? '🔇' : '🔊'}
      </button>
      <span className="save-info">
        {saves.info ? `上次存檔：第 ${saves.info.gameDay} 天` : '尚無存檔'}
      </span>
      {saves.message && <span className="save-message">{saves.message}</span>}
    </div>
  );
}
