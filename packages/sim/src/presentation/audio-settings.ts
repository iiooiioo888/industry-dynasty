/**
 * 音訊設定 · audio settings
 *
 * 原本只有一個「開／關」。實際上「點按鈕的音效」與「背景環境音」
 * 是兩種完全不同的東西：玩家可能想留著環境音但關掉點擊聲，
 * 或反過來。所以拆成兩個聲道，各自有音量。
 *
 * 這個模組只做純計算（夾範圍、預設值、靜音時歸零），
 * 真正的播放與 `AudioContext` 留在瀏覽器端。
 */
export type AudioChannel = 'sfx' | 'ambient';

export interface AudioSettings {
  /** 總開關：關閉時所有聲道都是 0 */
  readonly muted: boolean;
  /** 介面音效音量（0–1） */
  readonly sfxVolume: number;
  /** 環境音音量（0–1） */
  readonly ambientVolume: number;
}

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  muted: false,
  sfxVolume: 0.18,
  ambientVolume: 0.08,
};

/** 把音量夾在 0–1；非數字一律視為 0。 */
export function clampVolume(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 0;
  }
  if (value <= 0) {
    return 0;
  }
  return value > 1 ? 1 : value;
}

/**
 * 補齊缺欄位並夾好範圍。
 *
 * 舊設定檔只有 `muted` 一個欄位，讀進來時音量會退回預設值 ——
 * 不要因為缺欄位就當成 0，那會讓玩家「明明沒靜音卻沒聲音」。
 */
export function normalizeAudioSettings(raw: Partial<AudioSettings> | undefined): AudioSettings {
  if (!raw) {
    return DEFAULT_AUDIO_SETTINGS;
  }
  return {
    muted: raw.muted === true,
    sfxVolume:
      raw.sfxVolume === undefined ? DEFAULT_AUDIO_SETTINGS.sfxVolume : clampVolume(raw.sfxVolume),
    ambientVolume:
      raw.ambientVolume === undefined
        ? DEFAULT_AUDIO_SETTINGS.ambientVolume
        : clampVolume(raw.ambientVolume),
  };
}

/** 某聲道實際該用的音量（靜音時為 0）。 */
export function channelVolume(settings: AudioSettings, channel: AudioChannel): number {
  if (settings.muted) {
    return 0;
  }
  const value = channel === 'sfx' ? settings.sfxVolume : settings.ambientVolume;
  return clampVolume(value);
}

/** 調整某聲道音量，回傳新設定（不改原物件）。 */
export function withChannelVolume(
  settings: AudioSettings,
  channel: AudioChannel,
  volume: number,
): AudioSettings {
  const clamped = clampVolume(volume);
  return channel === 'sfx'
    ? { ...settings, sfxVolume: clamped }
    : { ...settings, ambientVolume: clamped };
}

/** 切換總開關。 */
export function withMuted(settings: AudioSettings, muted: boolean): AudioSettings {
  return { ...settings, muted };
}

/** 只有環境音、沒有介面音效時，是否算「聽得到聲音」。 */
export function hasAudibleOutput(settings: AudioSettings): boolean {
  return channelVolume(settings, 'sfx') > 0 || channelVolume(settings, 'ambient') > 0;
}
