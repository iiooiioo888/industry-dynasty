import { describe, expect, it } from 'vitest';
import { runDataReport, runSimulatedGames } from './simulate.js';
import { DEFAULT_SCENARIO } from '../sales/scenario.js';
import type { SimRosterEntry } from './types.js';

const cluster = (id: string): SimRosterEntry => ({
  id,
  name: '聚落工坊',
  strategy: 'cluster',
});

const speculator = (id: string): SimRosterEntry => ({
  id,
  name: '圈地投機',
  strategy: 'speculator',
});

describe('模擬對局', () => {
  it('拒絕無效局數與空名冊', () => {
    expect(() => runDataReport({ gameCount: 0 })).toThrow(/局數/);
    expect(() => runDataReport({ gameCount: 1.5 })).toThrow(/局數/);
    expect(() => runDataReport({ roster: [] })).toThrow(/名冊/);
    expect(() => runDataReport({ mapWidth: 1, mapHeight: 1 })).toThrow(/地圖/);
  });

  it('相同種子得到相同報表', () => {
    const first = runDataReport({ gameCount: 2, seed: 11 });
    const second = runDataReport({ gameCount: 2, seed: 11 });
    expect(second).toEqual(first);
  });

  it('聚落工坊靠相鄰工廠獲利且不破產', () => {
    const [game] = runSimulatedGames({
      gameCount: 1,
      seed: 1,
      roster: [cluster('solo-cluster')],
    });
    const player = game?.players[0];
    expect(player?.completeFactories).toBeGreaterThan(0);
    expect(player?.bankrupt).toBe(false);
    expect(player?.netProfit).toBeGreaterThan(0);
    expect(game?.monopolyShare).toBe(1);
  });

  it('圈地投機只囤地、不生產，且土地無法變現', () => {
    const [game] = runSimulatedGames({
      gameCount: 1,
      seed: 1,
      roster: [speculator('solo-speculator')],
    });
    const player = game?.players[0];
    // 核心不變：它永遠不建廠、沒有產能，因此沒有可持續收入
    expect(player?.completeFactories).toBe(0);
    expect(player?.capacity).toBe(0);
    // 唯一的收入是賣掉開局配發的起始原料（一次性）
    expect(player?.won).toBe(false);
    // 稅率調降後（土地稅 30/日），囤地不再必然破產 ——
    // 它靠閒置現金利息撐住，但持有土地本身仍然不產生任何收入。
    expect(player?.netProfit).toBeLessThan(
      runDataReport({ gameCount: 1, seed: 1, roster: [cluster('c1')] }).netProfit.mean,
    );
  });

  it('聚落策略的平均淨利高於圈地', () => {
    const clustered = runDataReport({
      gameCount: 2,
      seed: 7,
      roster: [cluster('c1'), cluster('c2')],
    });
    const hoarders = runDataReport({
      gameCount: 2,
      seed: 7,
      roster: [speculator('s1'), speculator('s2')],
    });

    expect(clustered.netProfit.mean).toBeGreaterThan(hoarders.netProfit.mean);
  });

  it('報表平均淨利等於逐局玩家淨利的平均', () => {
    const games = runSimulatedGames({ gameCount: 2, seed: 5 });
    const report = runDataReport({ gameCount: 2, seed: 5 });
    const profits = games.flatMap((game) => game.players.map((player) => player.netProfit));
    const average = profits.reduce((sum, value) => sum + value, 0) / profits.length;

    expect(report.observations).toBe(profits.length);
    expect(report.netProfit.mean).toBeCloseTo(average);
    expect(
      report.netProfit.distribution.buckets.reduce((sum, bucket) => sum + bucket.count, 0),
    ).toBe(report.observations);
    expect(report.bankruptcyRate).toBeGreaterThanOrEqual(0);
    expect(report.bankruptcyRate).toBeLessThanOrEqual(1);
    expect(report.monopoly.tendency).toBeGreaterThan(0);
    expect(report.monopoly.tendency).toBeLessThanOrEqual(1);
    // 預設參數現在對齊出貨情境，而非先前的 6×5 / horizon 18
    expect(report.parameters.horizon).toBe(DEFAULT_SCENARIO.maxDays);
    expect(report.parameters.rosterSize).toBe(4);
  });
});
