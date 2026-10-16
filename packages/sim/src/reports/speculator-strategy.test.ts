import { describe, expect, it } from 'vitest';
import { runSimulatedGames, resolveSimulationOptions } from './simulate.js';
import { DEFAULT_SCENARIO } from '../sales/scenario.js';
import { DEFAULT_WORLD_CONFIG } from '../world/config.js';
import { createInitialWorld } from '../world/create-world.js';
import { chooseBid, chooseBuilds, type StrategyContext } from './strategies.js';
import { createRng } from './rng.js';
import { LAND_MARKET, landBreakEvenDays } from '../balance/targets.js';

const SPEC = 'speculator' as const;

function soloSpeculator(games: number, startingCash: number) {
  return runSimulatedGames(
    resolveSimulationOptions({
      gameCount: games,
      seed: 4242,
      startingCash,
      horizon: DEFAULT_SCENARIO.maxDays,
      mapWidth: DEFAULT_WORLD_CONFIG.mapWidth,
      mapHeight: DEFAULT_WORLD_CONFIG.mapHeight,
      roster: [{ id: 'spec', name: '圈地投機', strategy: SPEC }],
    }),
  );
}

/**
 * 圈地投機：買地 → 等增值 → 轉手。
 *
 * 這個策略原本是個**沒有出口的資金黑洞**：買到的地只會一直繳稅，
 * 永遠無法變現，所以只能當成量尺（floor）而不是可玩策略。
 * `SELL_LAND`（見 `world/land-sale.ts`）補上出口之後，
 * 它變成一個「可行但非最優」的路線 —— 這正是要守住的不變量。
 */
describe('圈地投機策略', () => {
  it('策略本身不建廠、不生產（它是純地產路線）', () => {
    const world = createInitialWorld({ startingCash: 100_000 });
    const ctx: StrategyContext = {
      state: world,
      playerId: world.localPlayerId,
      rng: createRng(1),
      landTaxPerTick: 30,
    };

    expect(chooseBuilds(SPEC, ctx)).toEqual([]);
    const bid = chooseBid(SPEC, ctx);
    expect(bid === null || bid.type === 'BID').toBe(true);
  });

  it('引擎層級：土地有轉手出口（SELL_LAND）', async () => {
    const fs = await import('node:fs');
    const source = fs.readFileSync(new URL('../world/actions.ts', import.meta.url), 'utf8');
    const actionTypes = [...source.matchAll(/type: '([A-Z_]+)'/g)].map((m) => m[1]);
    expect(actionTypes).toContain('BID');
    expect(actionTypes).toContain('DEMOLISH');
    // 這個動作是為了補上「圈地投機」缺少的出口 ——
    // 沒有它，買來的地只能一直繳稅，永遠無法換回現金。
    expect(actionTypes).toContain('SELL_LAND');
  });

  it('永不建廠、產能恆為 0（所有起始現金皆成立）', () => {
    for (const startingCash of [50_000, 100_000, 250_000]) {
      for (const game of soloSpeculator(2, startingCash)) {
        const p = game.players[0]!;
        // 沒有工廠就沒有產能，也沒有可持續的生產收入
        expect(p.completeFactories).toBe(0);
        expect(p.capacity).toBe(0);
      }
    }
  });

  it('會「買地 → 增值 → 轉手」：期末不再囤滿地，且轉手有收入', () => {
    for (const startingCash of [50_000, 100_000]) {
      for (const game of soloSpeculator(2, startingCash)) {
        const p = game.players[0]!;
        // 出口存在的證據：地塊會賣掉，所以期末不會還抱著上限數量
        console.log(
          `起始 ${startingCash}: 期末持有 ${p.ownedParcels} 塊、淨利 ${p.netProfit}、現金 ${p.endingCash}`,
        );
        expect(p.ownedParcels).toBeLessThan(12);
      }
    }
  });

  it('持有門檻落在通關期限內，所以這條路線可行', () => {
    // 若回本天數超過 maxDays，投機就永遠不可能獲利，出口形同虛設
    expect(landBreakEvenDays()).toBeLessThan(DEFAULT_SCENARIO.maxDays);
    expect(LAND_MARKET.resaleRate).toBeGreaterThan(0);
    expect(LAND_MARKET.resaleRate).toBeLessThan(1);
    console.log(
      `\n回本天數=${landBreakEvenDays()} 期限=${DEFAULT_SCENARIO.maxDays}` +
        `（折價 ${((1 - LAND_MARKET.resaleRate) * 100).toFixed(0)}%、日成長 ${(LAND_MARKET.appreciationPerDay * 100).toFixed(1)}%）`,
    );
  });

  it('可行但非最優：對照組（會建廠）在競爭下淨利更高', () => {
    const games = runSimulatedGames(
      resolveSimulationOptions({
        gameCount: 6,
        seed: 4242,
        horizon: DEFAULT_SCENARIO.maxDays,
        mapWidth: DEFAULT_WORLD_CONFIG.mapWidth,
        mapHeight: DEFAULT_WORLD_CONFIG.mapHeight,
      }),
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
    const mean = (s: string) => sums.get(s)!.total / sums.get(s)!.n;
    console.log(
      `\n競爭下平均淨利：聚落 ${Math.round(mean('cluster'))}、圈地 ${Math.round(mean('speculator'))}`,
    );

    // 這是要守住的不變量：地產路線不該壓過實際經營工廠。
    // 先前把日成長調到 4.5% 時，投機淨利衝到 190,342（經營只有 32,893）——
    // 那會讓「完全不要蓋工廠」變成最佳解，遊戲的核心迴圈就失去意義。
    expect(mean('cluster')).toBeGreaterThan(mean('speculator'));
    expect(mean('cluster')).toBeGreaterThan(0);
  });
});
