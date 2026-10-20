import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AUDIO_SETTINGS,
  channelVolume,
  clampVolume,
  hasAudibleOutput,
  normalizeAudioSettings,
  withChannelVolume,
  withMuted,
  type AudioSettings,
} from './audio-settings.js';

/**
 * 音訊設定。
 *
 * 重點是不要讓玩家「明明沒靜音卻沒聲音」：舊設定檔缺少音量欄位時
 * 要退回預設值，而不是當成 0。
 */
describe('音訊設定', () => {
  it('預設值可聽得到聲音', () => {
    expect(hasAudibleOutput(DEFAULT_AUDIO_SETTINGS)).toBe(true);
    expect(channelVolume(DEFAULT_AUDIO_SETTINGS, 'sfx')).toBeGreaterThan(0);
    expect(channelVolume(DEFAULT_AUDIO_SETTINGS, 'ambient')).toBeGreaterThan(0);
  });

  it('clampVolume 夾在 0–1，非數字視為 0', () => {
    expect(clampVolume(-5)).toBe(0);
    expect(clampVolume(0)).toBe(0);
    expect(clampVolume(0.5)).toBe(0.5);
    expect(clampVolume(2)).toBe(1);
    expect(clampVolume(Number.NaN)).toBe(0);
    expect(clampVolume('0.5')).toBe(0);
    expect(clampVolume(undefined)).toBe(0);
  });

  it('靜音時所有聲道都是 0', () => {
    const muted: AudioSettings = { ...DEFAULT_AUDIO_SETTINGS, muted: true };
    expect(channelVolume(muted, 'sfx')).toBe(0);
    expect(channelVolume(muted, 'ambient')).toBe(0);
    expect(hasAudibleOutput(muted)).toBe(false);
  });

  it('舊設定只有 muted 時，音量退回預設（不會變成 0）', () => {
    const legacy = normalizeAudioSettings({ muted: true } as Partial<AudioSettings>);
    expect(legacy.muted).toBe(true);
    expect(legacy.sfxVolume).toBe(DEFAULT_AUDIO_SETTINGS.sfxVolume);
    expect(legacy.ambientVolume).toBe(DEFAULT_AUDIO_SETTINGS.ambientVolume);
  });

  it('normalizeAudioSettings 會夾範圍並處理壞資料', () => {
    expect(normalizeAudioSettings(undefined)).toEqual(DEFAULT_AUDIO_SETTINGS);
    const clamped = normalizeAudioSettings({ sfxVolume: 9, ambientVolume: -3 });
    expect(clamped.sfxVolume).toBe(1);
    expect(clamped.ambientVolume).toBe(0);
  });

  it('兩個聲道可以獨立調整', () => {
    let settings = DEFAULT_AUDIO_SETTINGS;
    settings = withChannelVolume(settings, 'sfx', 0);
    expect(channelVolume(settings, 'sfx')).toBe(0);
    expect(channelVolume(settings, 'ambient')).toBeGreaterThan(0);
    expect(hasAudibleOutput(settings)).toBe(true);

    settings = withChannelVolume(settings, 'ambient', 0);
    expect(hasAudibleOutput(settings)).toBe(false);
  });

  it('調整音量不會改動原物件', () => {
    const before = DEFAULT_AUDIO_SETTINGS;
    const after = withChannelVolume(before, 'sfx', 0.5);
    expect(after).not.toBe(before);
    expect(before.sfxVolume).toBe(DEFAULT_AUDIO_SETTINGS.sfxVolume);
  });

  it('調整音量也會夾範圍', () => {
    const loud = withChannelVolume(DEFAULT_AUDIO_SETTINGS, 'ambient', 99);
    expect(loud.ambientVolume).toBe(1);
    const silent = withChannelVolume(DEFAULT_AUDIO_SETTINGS, 'ambient', -1);
    expect(silent.ambientVolume).toBe(0);
  });

  it('切換靜音不會動到各自音量（取消靜音後恢復）', () => {
    const custom = withChannelVolume(DEFAULT_AUDIO_SETTINGS, 'sfx', 0.42);
    const muted = withMuted(custom, true);
    expect(channelVolume(muted, 'sfx')).toBe(0);
    const unmuted = withMuted(muted, false);
    expect(channelVolume(unmuted, 'sfx')).toBe(0.42);
  });
});
