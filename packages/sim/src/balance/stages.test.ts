import { describe, expect, it } from 'vitest';
import { FIRST_STAGE, STAGES, isFinalStage, nextStage, stageById, stageByIndex } from './stages.js';
import { stageWorldConfig } from '../world/config.js';
import { createInitialWorld } from '../world/create-world.js';
import { scenarioForStage } from '../sales/scenario.js';
import { DEFAULT_SCENARIO } from '../sales/scenario.js';
import { BALANCE } from './targets.js';

/**
 * 關卡表。
 *
 * 原型《創業王》有 22 關，每關有年代、起始資金與目標組。
 * 這裡驗的是**表本身的健全性**與**與既有平衡的一致性** ——
 * 關卡只調整輸入，所以第一關的目標必須等於原本的單局設計值。
 */
describe('關卡表', () => {
  it('共 22 關，編號連續遞增', () => {
    expect(STAGES).toHaveLength(22);
    STAGES.forEach((stage, index) => {
      expect(stage.index).toBe(index + 1);
    });
  });

  it('id 不重複，且都能查回來', () => {
    const ids = new Set(STAGES.map((stage) => stage.id));
    expect(ids.size).toBe(STAGES.length);
    for (const stage of STAGES) {
      expect(stageById(stage.id)).toEqual(stage);
      expect(stageByIndex(stage.index)).toEqual(stage);
    }
  });

  it('每關都有名稱、年代與開場提示', () => {
    for (const stage of STAGES) {
      expect(stage.nameZh.length).toBeGreaterThan(0);
      expect(stage.eraLabel).toMatch(/^\d{4}–\d{4}$/);
      expect(stage.briefing.length).toBeGreaterThan(5);
    }
  });

  it('年代隨關卡推進（不會倒退）', () => {
    const startYears = STAGES.map((stage) => Number(stage.eraLabel.slice(0, 4)));
    for (let i = 1; i < startYears.length; i += 1) {
      expect(startYears[i]!, `${STAGES[i]!.id} 的年代倒退了`).toBeGreaterThanOrEqual(
        startYears[i - 1]!,
      );
    }
  });

  it('目標單調遞增（後面的關卡不會更鬆）', () => {
    for (let i = 1; i < STAGES.length; i += 1) {
      const prev = STAGES[i - 1]!.targets;
      const cur = STAGES[i]!.targets;
      expect(cur.netProfit, `${STAGES[i]!.id} 淨利目標下降`).toBeGreaterThanOrEqual(prev.netProfit);
      expect(cur.craftedValue, `${STAGES[i]!.id} 加工目標下降`).toBeGreaterThanOrEqual(
        prev.craftedValue,
      );
      expect(cur.debtRepaid, `${STAGES[i]!.id} 還款目標下降`).toBeGreaterThanOrEqual(
        prev.debtRepaid,
      );
    }
  });

  it('起始資金與天數都不會倒退', () => {
    for (let i = 1; i < STAGES.length; i += 1) {
      expect(STAGES[i]!.startingCash).toBeGreaterThanOrEqual(STAGES[i - 1]!.startingCash);
      expect(STAGES[i]!.maxDays).toBeGreaterThanOrEqual(STAGES[i - 1]!.maxDays);
    }
  });

  it('難度不成長得比資金慢（否則後面的關卡反而更簡單）', () => {
    const first = STAGES[0]!;
    const last = STAGES[STAGES.length - 1]!;
    const cashGrowth = last.startingCash / first.startingCash;
    // 淨利受到經濟天花板限制（規模紅利只到 6 塊地），所以不能拿它當唯一指標。
    // 真正在後期把難度拉開的是**加工產值**，所以用兩者合計的成長倍率比較。
    const difficultyGrowth =
      (last.targets.netProfit + last.targets.craftedValue) /
      (first.targets.netProfit + first.targets.craftedValue);
    expect(
      difficultyGrowth,
      `難度成長 ${difficultyGrowth.toFixed(2)} 應高於資金成長 ${cashGrowth.toFixed(2)}`,
    ).toBeGreaterThan(cashGrowth);
  });

  it('難度隨關卡推進（不會倒退）', () => {
    for (let i = 1; i < STAGES.length; i += 1) {
      expect(STAGES[i]!.difficulty).toBeGreaterThanOrEqual(STAGES[i - 1]!.difficulty);
    }
  });

  /**
   * 第 20 回合重新校準後，第一關的目標不再等於 `BALANCE` 的舊單局值。
   *
   * 舊值（30,000／36,000）是照 `full-loop` harness 訂的，而那個 harness
   * 低估產能約 30 倍 —— 目標照它訂，結果就是兩天速通。
   * 現在改用玩家動作量測（見 `reports/stage-winnability.test.ts`）。
   */
  it('第一關目標是照「玩家動作」校準的，比舊單局值高一個量級', () => {
    expect(FIRST_STAGE.targets.netProfit).toBeGreaterThan(BALANCE.targetNetProfit * 10);
    expect(FIRST_STAGE.targets.craftedValue).toBeGreaterThan(BALANCE.targetCraftedValue * 10);
    // `DEFAULT_SCENARIO` 仍是舊的單局設定（給報表 harness 用），不跟著改
    expect(DEFAULT_SCENARIO.stageId).toBe(FIRST_STAGE.id);
  });

  it('nextStage 依序推進，最後一關之後沒有下一關', () => {
    expect(nextStage(FIRST_STAGE.id)?.index).toBe(2);
    for (let i = 1; i < STAGES.length; i += 1) {
      const current = STAGES[i - 1]!;
      const next = nextStage(current.id);
      expect(next?.index).toBe(current.index + 1);
    }
    expect(nextStage(STAGES[STAGES.length - 1]!.id)).toBeUndefined();
    expect(nextStage('不存在的關卡')).toBeUndefined();
  });

  it('isFinalStage 只對最後一關為真', () => {
    expect(isFinalStage(STAGES[0]!.id)).toBe(false);
    expect(isFinalStage(STAGES[STAGES.length - 1]!.id)).toBe(true);
    expect(isFinalStage('不存在的關卡')).toBe(false);
  });

  it('scenarioForStage 會把關卡目標帶進設定', () => {
    for (const stage of STAGES) {
      const config = scenarioForStage(stage.id);
      expect(config.targetNetProfit).toBe(stage.targets.netProfit);
      expect(config.targetCraftedValue).toBe(stage.targets.craftedValue);
      expect(config.targetDebtRepaid).toBe(stage.targets.debtRepaid);
      expect(config.maxDays).toBe(stage.maxDays);
      expect(config.stageId).toBe(stage.id);
    }
  });

  it('不存在的關卡退回第一關，不會炸掉', () => {
    expect(scenarioForStage('不存在').stageId).toBe(FIRST_STAGE.id);
    expect(scenarioForStage('不存在').targetNetProfit).toBe(FIRST_STAGE.targets.netProfit);
  });

  it('createInitialWorld 會依關卡設定起始資金與目標', () => {
    for (const stage of [STAGES[0]!, STAGES[9]!, STAGES[STAGES.length - 1]!]) {
      const state = createInitialWorld(stageWorldConfig(stage.id));
      expect(state.players[state.localPlayerId]!.cash).toBe(stage.startingCash);
      expect(state.scenario.config.stageId).toBe(stage.id);
      expect(state.scenario.config.targetNetProfit).toBe(stage.targets.netProfit);
      expect(state.scenario.config.maxDays).toBe(stage.maxDays);
      expect(state.scenario.status).toBe('playing');
      expect(state.gameDay).toBe(0);
    }
  });

  it('預設開局就是第一關（不指定 stageId 時）', () => {
    const state = createInitialWorld();
    expect(state.scenario.config.stageId).toBe(FIRST_STAGE.id);
    expect(state.players[state.localPlayerId]!.cash).toBe(FIRST_STAGE.startingCash);
  });

  it('stageWorldConfig 不存在的關卡退回第一關', () => {
    const config = stageWorldConfig('不存在');
    expect(config.stageId).toBe(FIRST_STAGE.id);
    expect(config.startingCash).toBe(FIRST_STAGE.startingCash);
  });

  it('每關的目標都高於 0 且天數合理', () => {
    // 天數從 25–33 縮到 12–18：實測經濟在第 12 天見頂（之後稅金與維護
    // 繼續扣、銷售封頂），原本的長度有一半時間在走下坡。
    for (const stage of STAGES) {
      expect(stage.maxDays).toBeGreaterThanOrEqual(12);
      expect(stage.maxDays).toBeLessThanOrEqual(18);
      expect(stage.targets.netProfit).toBeGreaterThan(0);
      expect(stage.targets.craftedValue).toBeGreaterThan(0);
      expect(stage.targets.debtRepaid).toBeGreaterThan(0);
    }
  });
});
