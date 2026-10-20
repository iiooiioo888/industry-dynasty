import {
  DEFAULT_AUDIO_SETTINGS,
  channelVolume,
  normalizeAudioSettings,
  type AudioChannel,
  type AudioSettings,
} from '@industry-dynasty/sim';

/**
 * 音效播放器。
 *
 * 全部用 Web Audio 即時合成 —— **不需要任何音訊素材檔**，
 * 所以不會增加 bundle 大小，也不會有授權問題。
 *
 * 兩個聲道：
 * - `sfx`：介面回饋（點擊、成交、通關），短促、有方向性
 * - `ambient`：背景環境音（低頻持續音墊），持續、極小聲
 *
 * 設計上的取捨：
 * - 瀏覽器要求使用者互動後才能播聲音，所以 `AudioContext` 延遲到第一次播放才建立。
 * - 環境音是「一層緩慢移動的和聲墊」而不是旋律 —— 經營遊戲長時間掛著，
 *   有旋律會很煩。
 * - 設定（靜音與兩個聲道音量）存在 localStorage。
 */
const SETTINGS_KEY = 'industry-dynasty/audio/v2';
const LEGACY_MUTE_KEY = 'industry-dynasty/audio-muted/v1';

interface CueSpec {
  readonly from: number;
  readonly to: number;
  readonly duration: number;
  readonly type: OscillatorType;
  readonly gain: number;
}

const CUES: Readonly<Record<string, CueSpec>> = {
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
let masterGain: GainNode | null = null;
let ambientNodes: { osc: OscillatorNode[]; gain: GainNode } | null = null;
let settings: AudioSettings = readSettings();

function readSettings(): AudioSettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (raw) {
      return normalizeAudioSettings(JSON.parse(raw) as Partial<AudioSettings>);
    }
    // 舊版只有一個 muted 旗標，保留玩家的選擇
    const legacy = window.localStorage.getItem(LEGACY_MUTE_KEY);
    if (legacy !== null) {
      return normalizeAudioSettings({ muted: legacy === '1' });
    }
  } catch {
    // 壞資料或停用儲存 → 用預設值
  }
  return DEFAULT_AUDIO_SETTINGS;
}

function persist(next: AudioSettings): void {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {
    // 存不起來只影響下次開場的預設值
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
    masterGain = context.createGain();
    masterGain.gain.value = 1;
    masterGain.connect(context.destination);
    return context;
  } catch {
    return null;
  }
}

export function getAudioSettings(): AudioSettings {
  return settings;
}

export function setAudioSettings(partial: Partial<AudioSettings>): AudioSettings {
  settings = normalizeAudioSettings({ ...settings, ...partial });
  persist(settings);
  applyChannelVolumes();
  return settings;
}

function applyChannelVolumes(): void {
  if (ambientNodes && context) {
    ambientNodes.gain.gain.setTargetAtTime(
      channelVolume(settings, 'ambient'),
      context.currentTime,
      0.4,
    );
  }
}

/** 播放一個介面提示音。任何錯誤都靜靜吞掉 —— 音效不該讓遊戲崩掉。 */
export function playCue(cue: string): void {
  const volume = channelVolume(settings, 'sfx');
  if (volume <= 0) {
    return;
  }
  const ctx = ensureContext();
  const spec = CUES[cue];
  if (!ctx || !masterGain || !spec) {
    return;
  }
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
    const peak = volume * spec.gain;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(peak, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + spec.duration);
    osc.connect(gain);
    gain.connect(masterGain);
    osc.start(now);
    osc.stop(now + spec.duration + 0.02);
  } catch {
    // 某些瀏覽器在無互動時會拒絕播放
  }
}

/**
 * 啟動環境音。
 *
 * 三個低頻振盪器（根音 + 五度 + 八度）經過低通濾波，音量極低、
 * 緩慢起伏。這是「氛圍」而不是「音樂」—— 掛機幾小時也不會膩。
 *
 * 重複呼叫是安全的（已啟動就直接回傳）。
 */
export function startAmbient(): void {
  if (ambientNodes) {
    applyChannelVolumes();
    return;
  }
  const ctx = ensureContext();
  if (!ctx || !masterGain) {
    return;
  }
  try {
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }
    const gain = ctx.createGain();
    gain.gain.value = channelVolume(settings, 'ambient');
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    filter.Q.value = 0.6;

    const roots = [110, 164.81, 220];
    const osc = roots.map((frequency, index) => {
      const node = ctx.createOscillator();
      node.type = 'sine';
      node.frequency.value = frequency;
      // 每個聲部用不同的相位差緩慢擺動，避免聽起來像死板的和弦
      node.detune.value = index * 6 - 6;
      node.connect(filter);
      node.start();
      return node;
    });
    filter.connect(gain);
    gain.connect(masterGain);
    ambientNodes = { osc, gain };
  } catch {
    // 忽略
  }
}

export function stopAmbient(): void {
  if (!ambientNodes) {
    return;
  }
  try {
    for (const node of ambientNodes.osc) {
      node.stop();
      node.disconnect();
    }
    ambientNodes.gain.disconnect();
  } catch {
    // 忽略
  }
  ambientNodes = null;
}

/** 匯出聲道音量，供 UI 顯示。 */
export function volumeOf(channel: AudioChannel): number {
  return channelVolume(settings, channel);
}
