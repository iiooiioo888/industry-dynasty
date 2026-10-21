import { guidanceFor } from '@industry-dynasty/sim';
import type { WorldState } from '@industry-dynasty/sim';
import { useState } from 'react';
import './GuidanceBanner.css';

export interface GuidanceBannerProps {
  state: WorldState;
}

/**
 * 教學引導列。
 *
 * 顯示「現在該做什麼」與進度（第 n / 總步數）。可以收起來 ——
 * 老玩家不想被唸，但新手若沒這條，開局面對一堆面板不知道從哪開始。
 */
export function GuidanceBanner({ state }: GuidanceBannerProps) {
  const [dismissed, setDismissed] = useState(false);
  const guidance = guidanceFor(state);
  if (dismissed || !guidance.step) {
    return null;
  }
  return (
    <div className="guidance-banner">
      <span className="guidance-count">
        {guidance.completed}/{guidance.total}
      </span>
      <strong>{guidance.step.title}</strong>
      <span className="guidance-detail">{guidance.step.detail}</span>
      <button type="button" onClick={() => setDismissed(true)} title="收起引導">
        收起
      </button>
    </div>
  );
}
