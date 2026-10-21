import { useState } from 'react';
import {
  DEFAULT_AUDIO_SETTINGS,
  hasAudibleOutput,
  type AudioSettings,
} from '@industry-dynasty/sim';
import { getAudioSettings, setAudioSettings, startAmbient, stopAmbient } from '../audio/player';
import './AudioMenu.css';

/**
 * 音訊設定選單。
 *
 * 原本只有一顆「🔊／🔇」按鈕。拆成兩個聲道之後需要音量控制，
 * 所以做一個小 popover —— 不佔版面，但想調的人找得到。
 */
export function AudioMenu() {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<AudioSettings>(() => getAudioSettings());

  const update = (partial: Partial<AudioSettings>) => {
    const next = setAudioSettings(partial);
    setSettings(next);
    if (hasAudibleOutput(next)) {
      startAmbient();
    } else {
      stopAmbient();
    }
  };

  const audible = hasAudibleOutput(settings);

  return (
    <div className="audio-menu">
      <button
        type="button"
        className="audio-toggle"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        title="音訊設定"
      >
        {audible ? '🔊' : '🔇'}
      </button>
      {open && (
        <div className="audio-popover" role="dialog" aria-label="音訊設定">
          <label className="audio-row">
            <input
              type="checkbox"
              checked={!settings.muted}
              onChange={(event) => update({ muted: !event.target.checked })}
            />
            <span>啟用聲音</span>
          </label>
          <label className="audio-row">
            <span>介面音效</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(settings.sfxVolume * 100)}
              onChange={(event) => update({ sfxVolume: Number(event.target.value) / 100 })}
            />
            <span className="audio-value">{Math.round(settings.sfxVolume * 100)}</span>
          </label>
          <label className="audio-row">
            <span>環境音</span>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(settings.ambientVolume * 100)}
              onChange={(event) => update({ ambientVolume: Number(event.target.value) / 100 })}
            />
            <span className="audio-value">{Math.round(settings.ambientVolume * 100)}</span>
          </label>
          <button
            type="button"
            className="audio-reset"
            onClick={() => update(DEFAULT_AUDIO_SETTINGS)}
          >
            恢復預設
          </button>
        </div>
      )}
    </div>
  );
}
