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
    const world = createInitialWorld({
      startingCash: 100_000,
      playerId: 'p1',
      playerName: '投機者',
    });
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

  it('引擎層級：土地現在有轉手出口（SELL_LAND）', async () => {
    const fs = await import('node:fs');
    const source = fs.readFileSync(new URL('../world/actions.ts', import.meta.url), 'utf8');
    const actionTypes = [...source.matchAll(/type: '([A-Z_]+)'/g)].map((m) => m[1]);
    expect(actionTypes).toContain('BID');
    expect(actionTypes).toContain('DEMOLISH');
    // 這個動作是為了補上「圈地投機」缺少的出口 ——
    // 沒有它，買來的地只能一直繳稅，永遠無法換回現金。
    expect(actionTypes).toContain('SELL_LAND');
    expect(actionTypes).not.toContain('REZONE');
  });

  it('投機者永不建廠、產能恆為 0（所有起始現金皆成立）', () => {
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
        // 關鍵性質：沒有工廠、沒有產能，所以沒有可持續的收入來源
        expect(p.completeFactories).toBe(0);
        expect(p.capacity).toBe(0);
        // 注意：revenue 不是 0 —— 開局配發的起始原料（24 原礦 + 18 樹脂）
        // 會被賣掉，那是一次性的變現，不是策略收入。因此這裡斷言的是
        // 「沒有產能」，而不是「revenue === 0」。
      }
    }
  });

  it('會買滿 12 塊上限，但持有土地不產生任何可持續收入', () => {
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
        // 土地變便宜（稅率調降連動底價）之後，它每一種起始現金都能買滿上限
        expect(p.ownedParcels).toBe(12);
        expect(p.completeFactories).toBe(0);
        expect(p.capacity).toBe(0);
        // 淨損益必然為負：只支出（購地＋土地稅）沒有可持續收入
        expect(p.netProfit).toBeLessThan(0);
      }
    }
  });

  it('淨損益為負，且沒有任何生產性現金流入', () => {
    const startingCash = 100_000;
    const games = runSimulatedGames(
      resolveSimulationOptions({
        gameCount: 4,
        seed: 4242,
        startingCash,
        roster: [{ id: 'spec', name: '圈地投機', strategy: SPEC }],
      }),
    );
    for (const game of games) {
      const p = game.players[0]!;
      expect(p.netProfit).toBeLessThan(0);
      // 唯一的收入是賣掉開局配發的起始原料（一次性），
      // 沒有工廠就沒有可持續收入 —— 這才是它必然虧損的原因。
      expect(p.completeFactories).toBe(0);
      expect(p.capacity).toBe(0);
      // 虧損必須小於起始現金（不會憑空超額支出）
      expect(-p.netProfit).toBeLessThan(startingCash);
    }
  });

  it('對照組有效：會建廠的策略在同一條件下淨利為正且更高', () => {
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

    // 對照組與實驗組必須有區辨力
    expect(mean('cluster')).toBeGreaterThan(mean('speculator'));
    expect(mean('rapid-assembly')).toBeGreaterThan(mean('speculator'));
    expect(mean('cluster')).toBeGreaterThan(0);
  });
});
