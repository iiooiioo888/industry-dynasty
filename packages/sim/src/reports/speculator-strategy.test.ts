import { describe, expect, it } from 'vitest';
import { runSimulatedGames, resolveSimulationOptions } from './simulate.js';
import { chooseBuilds, chooseBid, type StrategyContext } from './strategies.js';
import { createInitialWorld } from '../world/create-world.js';
import { createRng } from './rng.js';

/**
 * 圈地投機（speculator）策略的行為界定。
 *
 * 這是刻意的 **null control**：只買地、永不建廠（`chooseBuilds` 回傳 `[]`）。
 * 引擎的營運收入唯一來源是「已完工工廠」，而 `WorldAction` 沒有賣地、
 * 也沒有土地增值，所以投機者持有的土地**永遠無法轉換成現金或收入**。
 * 它的淨損益就只是 `−已繳土地稅`，破產與否取決於起始現金能否撐完全程。
 *
 * 實測（seed 4242、單一投機者、horizon 18、起始現金 50k/100k/250k）：
 * 起始現金 50k / 100k → 買不到地（出價搶不贏），現金被稅金逐 tick 扣到 0，
 * 淨利恰為 −起始現金；起始現金 250k → 買滿 12 塊上限，繳稅後剩 138,258。
 *
 * 換句話說：**這不是 bug，是一個沒有出口的資金黑洞**。
 * 它的角色是量尺（floor），不是可玩的策略。
 */

const SPEC = 'speculator' as const;

describe('圈地投機策略 · null control 界定', () => {
  it('策略層級：只出價、永不建廠', () => {
    const world = createInitialWorld({ startingCash: 100_000, playerId: 'p1', playerName: '投機者' });
    const ctx: StrategyContext = {
      state: world,
      playerId: 'p1',
      rng: createRng(1),
      landTaxPerTick: 500,
    };

    expect(chooseBuilds(SPEC, ctx)).toEqual([]);
    const bid = chooseBid(SPEC, ctx);
    expect(bid === null || bid.type === 'BID').toBe(true);
  });

  it('引擎層級：不存在任何賣地或土地增值 action', async () => {
    const fs = await import('node:fs');
    const source = fs.readFileSync(new URL('../world/actions.ts', import.meta.url), 'utf8');
    const actionTypes = [...source.matchAll(/type: '([A-Z_]+)'/g)].map((m) => m[1]);
    expect(actionTypes).toContain('BID');
    expect(actionTypes).toContain('DEMOLISH');
    expect(actionTypes).not.toContain('SELL_LAND');
    expect(actionTypes).not.toContain('SELL_PARCEL');
    expect(actionTypes).not.toContain('REZONE');
  });

  it('投機者收入恆為 0、永不建廠（所有起始現金皆成立）', () => {
    for (const startingCash of [50_000, 100_000, 250_000]) {
      const games = runSimulatedGames(
        resolveSimulationOptions({
          gameCount: 6,
          seed: 4242,
          startingCash,
          roster: [{ id: 'spec', name: '圈地投機', strategy: SPEC }],
        }),
      );
      for (const game of games) {
        const p = game.players[0]!;
        expect(p.completeFactories).toBe(0);
        expect(p.capacity).toBe(0);
        expect(p.revenue).toBe(0);
      }
    }
  });

  it('起始現金不足時買不到地，現金被稅金扣到 0，淨利 = −起始現金', () => {
    for (const startingCash of [50_000, 100_000]) {
      const games = runSimulatedGames(
        resolveSimulationOptions({
          gameCount: 6,
          seed: 4242,
          startingCash,
          roster: [{ id: 'spec', name: '圈地投機', strategy: SPEC }],
        }),
      );
      for (const game of games) {
        const p = game.players[0]!;
        expect(p.ownedParcels).toBe(0);
        expect(p.endingCash).toBe(0);
        expect(p.netProfit).toBe(-startingCash);
        expect(p.bankrupt).toBe(true);
      }
    }
  });

  it('起始現金充足時買滿 12 塊上限，但仍只有支出沒有收入', () => {
    const startingCash = 250_000;
    const games = runSimulatedGames(
      resolveSimulationOptions({
        gameCount: 6,
        seed: 4242,
        startingCash,
        roster: [{ id: 'spec', name: '圈地投機', strategy: SPEC }],
      }),
    );

    for (const game of games) {
      const p = game.players[0]!;
      // 策略的 SPECULATOR_TARGET 上限
      expect(p.ownedParcels).toBe(12);
      expect(p.completeFactories).toBe(0);
      // 沒有收入，但仍然沒破產 —— 錢只是變成了不會生錢的土地
      expect(p.bankrupt).toBe(false);
      // 淨損益 = −已繳土地稅，且必然為負
      const landTaxPaid = startingCash - p.endingCash;
      expect(landTaxPaid).toBeGreaterThan(0);
      expect(p.endingCash).toBe(startingCash - landTaxPaid);
      expect(p.netProfit).toBe(-landTaxPaid);
      // 關鍵：持有 12 塊地對淨利毫無幫助，與持有 0 塊地的差別只是少繳了稅
      expect(p.netProfit).toBeLessThan(0);
    }
  });

  it('對照組有效：會建廠的策略在同一條件下確實賺錢', () => {
    const games = runSimulatedGames(
      resolveSimulationOptions({ gameCount: 6, seed: 4242, startingCash: 50_000 }),
    );
    const sums = new Map<string, { total: number; n: number }>();
    for (const game of games) {
      for (const p of game.players) {
        const cur = sums.get(p.strategy) ?? { total: 0, n: 0 };
        cur.total += p.netProfit;
        cur.n += 1;
        sums.set(p.strategy, cur);
      }
    }

    const mean = (s: string) => {
      const v = sums.get(s)!;
      return v.total / v.n;
    };

    expect(mean('speculator')).toBe(-50_000);
    expect(mean('cluster')).toBeGreaterThan(0);
    expect(mean('rapid-assembly')).toBeGreaterThan(0);
    // 對照組與實驗組必須有區辨力
    expect(mean('cluster')).toBeGreaterThan(mean('speculator'));
  });
});
