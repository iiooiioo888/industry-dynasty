import { describe, expect, it } from 'vitest';
import { buildBriefing } from './briefing.js';
import { STAGES } from '../balance/stages.js';

/**
 * 關卡開場簡報。
 *
 * 純格式化，所以測試重點是：數字有沒有正確帶入、每一關都拿得到、
 * 以及難度分段給的提示有沒有對上關卡處境。
 */
describe('關卡開場簡報', () => {
  it('每一關都能產生簡報', () => {
    for (const stage of STAGES) {
      const briefing = buildBriefing(stage);
      expect(briefing.title).toBe(stage.nameZh);
      expect(briefing.era).toBe(stage.eraLabel);
      expect(briefing.opening.length).toBeGreaterThan(5);
      expect(briefing.focus.length).toBeGreaterThan(5);
      expect(briefing.lines.length).toBeGreaterThanOrEqual(6);
    }
  });

  it('目標與資金會帶入且格式化', () => {
    const stage = STAGES[0]!;
    const briefing = buildBriefing(stage);
    const byLabel = new Map(briefing.lines.map((line) => [line.label, line]));
    expect(byLabel.get('可用天數')?.value).toBe(`${stage.maxDays} 天`);
    expect(byLabel.get('起始資金')?.value).toContain(stage.startingCash.toLocaleString());
    expect(byLabel.get('目標淨利')?.value).toContain(stage.targets.netProfit.toLocaleString());
    expect(byLabel.get('目標加工產值')?.value).toContain(
      stage.targets.craftedValue.toLocaleString(),
    );
    expect(byLabel.get('目標清償貸款')?.value).toContain(stage.targets.debtRepaid.toLocaleString());
  });

  it('規模建議會帶入地塊數與加工深度', () => {
    for (const stage of STAGES) {
      const scale = buildBriefing(stage).lines.find((line) => line.label === '建議規模');
      expect(scale).toBeDefined();
      expect(scale!.value).toContain(`${stage.recommendedParcels} 塊地`);
      expect(scale!.value).toContain(stage.recommendedDepth === 1 ? '一階加工' : '二階加工');
    }
  });

  it('目標類條目會被標記為重點', () => {
    const briefing = buildBriefing(STAGES[0]!);
    const emphasised = briefing.lines.filter((line) => line.emphasis).map((line) => line.label);
    expect(emphasised).toContain('目標淨利');
    expect(emphasised).toContain('目標加工產值');
  });

  it('難度分段給的焦點提示不同', () => {
    const early = buildBriefing(STAGES[0]!).focus;
    const mid = buildBriefing(STAGES[6]!).focus;
    const late = buildBriefing(STAGES[STAGES.length - 1]!).focus;
    expect(early).not.toBe(mid);
    expect(mid).not.toBe(late);
    expect(early).toContain('賺錢');
    expect(late).toContain('精密模組');
  });

  it('同一關的簡報是穩定的（純函式）', () => {
    const stage = STAGES[11]!;
    expect(buildBriefing(stage)).toEqual(buildBriefing(stage));
  });
});
