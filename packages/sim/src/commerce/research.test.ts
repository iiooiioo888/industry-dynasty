import { describe, expect, it } from 'vitest';
import {
  RESEARCH_DEFS,
  RESEARCH_ORDER,
  canStartResearch,
  researchDays,
  type ResearchId,
} from './research.js';

/**
 * 研究鏈。
 *
 * 原本只有一項研究（16 刻 = 三分之一天），整局只有一次「等待解鎖」。
 * 後期關卡因此沒有需要時間才能拿到的東西 —— 玩家第 6 天就把產能拉到頂。
 *
 * 現在研究是一條有長度的鏈：越後面越久，而且必須依序完成。
 * 時間本身成了一種資源。
 */
describe('研究鏈', () => {
  it('每一項研究都有名稱、解鎖說明、費用與時長', () => {
    for (const id of RESEARCH_ORDER) {
      const def = RESEARCH_DEFS[id];
      expect(def.nameZh.length).toBeGreaterThan(0);
      expect(def.unlocks.length).toBeGreaterThan(0);
      expect(def.cost).toBeGreaterThan(0);
      expect(def.ticks).toBeGreaterThan(0);
    }
  });

  it('越後面的研究越久、越貴', () => {
    const defs = RESEARCH_ORDER.map((id) => RESEARCH_DEFS[id]);
    for (let i = 1; i < defs.length; i += 1) {
      expect(defs[i]!.ticks).toBeGreaterThan(defs[i - 1]!.ticks);
      expect(defs[i]!.cost).toBeGreaterThan(defs[i - 1]!.cost);
    }
  });

  it('除了第一項以外都有前置研究，且前置必須存在', () => {
    expect(RESEARCH_DEFS[RESEARCH_ORDER[0]!]!.requires).toBeUndefined();
    for (const id of RESEARCH_ORDER.slice(1)) {
      const requires = RESEARCH_DEFS[id].requires;
      expect(requires).toBeDefined();
      expect(RESEARCH_ORDER).toContain(requires as ResearchId);
    }
  });

  it('沒有前置時可以開始', () => {
    expect(canStartResearch(RESEARCH_DEFS['consumer-line'], [], false)).toEqual({ ok: true });
  });

  it('前置未完成時會被擋下，並說明要先把哪一項做完', () => {
    const gate = canStartResearch(RESEARCH_DEFS['control-line'], ['consumer-line'], false);
    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect(gate.reason).toContain('精密加工');
    }
  });

  it('前置完成後可以開始', () => {
    expect(
      canStartResearch(RESEARCH_DEFS['control-line'], ['consumer-line', 'precision-line'], false),
    ).toEqual({ ok: true });
  });

  it('已有研究進行中時不能再開新的', () => {
    const gate = canStartResearch(RESEARCH_DEFS['precision-line'], ['consumer-line'], true);
    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect(gate.reason).toContain('進行中');
    }
  });

  it('已完成的研究不能再做一次', () => {
    const gate = canStartResearch(RESEARCH_DEFS['consumer-line'], ['consumer-line'], false);
    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect(gate.reason).toContain('完成');
    }
  });

  it('時長以「天」表示（48 刻 = 1 天）', () => {
    expect(researchDays(RESEARCH_DEFS['consumer-line'])).toBeCloseTo(0.3, 1);
    expect(researchDays(RESEARCH_DEFS['precision-line'])).toBe(1.5);
    expect(researchDays(RESEARCH_DEFS['control-line'])).toBe(3);
  });

  it('整條鏈的總時長足以讓後期關卡必須提早開始', () => {
    const total = RESEARCH_ORDER.reduce((sum, id) => sum + RESEARCH_DEFS[id].ticks, 0);
    const days = total / 48;
    // 四天半 —— 12 天的關卡裡，這是一段不能忽略的時間
    expect(days).toBeGreaterThan(4);
  });
});
