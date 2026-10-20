import { DEFAULT_CUE_VOLUME, type SoundCue } from '@industry-dynasty/sim';

/**
 * 音效播放器。
 *
 * 全部用 Web Audio 的振盪器即時合成 —— **不需要任何音訊素材檔**，
 * 所以不會增加 bundle 大小，也不會有授權問題。
 *
 * 設計上的取捨：
 * - 瀏覽器要求使用者互動後才能播聲音，所以 `AudioContext` 延遲到第一次播放才建立。
 * - 音效很短（< 0.25 秒），並且刻意壓低音量：這是 UI 回饋，不是配樂。
 * - 靜音設定存在 localStorage，重開瀏覽器仍然記得。
 */
const MUTE_KEY = 'industry-dynasty/audio-muted/v1';

interface CueSpec {
  /** 起始頻率（Hz） */
  readonly from: number;
  /** 結束頻率（Hz）。等於 `from` 表示不滑音 */
  readonly to: number;
  /** 持續秒數 */
  readonly duration: number;
  readonly type: OscillatorType;
  /** 相對音量倍率 */
  readonly gain: number;
}

/**
 * 每個提示的音色。
 *
 * 高的短音＝成功／確認；下滑音＝失敗；上升雙音＝通關。
 * 用音高與方向表達結果，不看畫面也能分辨。
 */
const CUES: Readonly<Record<SoundCue, CueSpec>> = {
  click: { from: 660, to: 660, duration: 0.05, type: 'triangle', gain: 0.7 },
  bid: { from: 520, to: 700, duration: 0.09, type: 'triangle', gain: 0.9 },
  'deal-won': { from: 720, to: 1040, duration: 0.14, type: 'triangle', gain: 1 },
  'deal-lost': { from: 420, to: 240, duration: 0.16, type: 'sine', gain: 0.9 },
  'build-start': { from: 300, to: 420, duration: 0.14, type: 'square', gain: 0.5 },
  'build-done': { from: 520, to: 780, duration: 0.18, type: 'triangle', gain: 0.9 },
  'production-start': { from: 380, to: 560, duration: 0.12, type: 'sawtooth', gain: 0.5 },
  'cash-in': { from: 880, to: 1180, duration: 0.1, type: 'triangle', gain: 0.8 },
  'day-close': { from: 240, to: 240, duration: 0.08, type: 'sine', gain: 0.5 },
  'stage-won': { from: 620, to: 1240, duration: 0.3, type: 'triangle', gain: 1 },
  'stage-lost': { from: 320, to: 140, duration: 0.35, type: 'sine', gain: 1 },
  error: { from: 200, to: 160, duration: 0.12, type: 'square', gain: 0.55 },
};

let context: AudioContext | null = null;
let muted = readMuted();

function readMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

function ensureContext(): AudioContext | null {
  if (typeof window === 'undefined') {
    return null;
  }
  if (context) {
    return context;
  }
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) {
    return null;
  }
  try {
    context = new Ctor();
    return context;
  } catch {
    return null;
  }
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(next: boolean): void {
  muted = next;
  try {
    window.localStorage.setItem(MUTE_KEY, next ? '1' : '0');
  } catch {
    // 存不起來只影響下次開場的預設值
  }
}

export function toggleMuted(): boolean {
  setMuted(!muted);
  return muted;
}

/** 播放一個提示音。任何錯誤都靜靜吞掉 —— 音效不該讓遊戲崩掉。 */
export function playCue(cue: SoundCue): void {
  if (muted) {
    return;
  }
  const ctx = ensureContext();
  if (!ctx) {
    return;
  }
  const spec = CUES[cue];
  try {
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = spec.type;
    osc.frequency.setValueAtTime(spec.from, now);
    if (spec.to !== spec.from) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, spec.to), now + spec.duration);
    }
    const peak = DEFAULT_CUE_VOLUME * spec.gain;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(peak, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + spec.duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + spec.duration + 0.02);
  } catch {
    // 忽略：某些瀏覽器在無互動時會拒絕播放
  }
}
