import { describe, expect, it } from 'vitest';
import {
  RIVAL_BASE_PRESENCE,
  RIVAL_COUNTER_THRESHOLD,
  RIVAL_PRESENCE_CAP,
  respondToPlayerShare,
} from './rivals.js';
import type { RivalOutlet } from './types.js';

function rival(presence: number, cityId = 'c1'): RivalOutlet {
  return {
    id: `rival-${cityId}`,
    nameZh: '同業門市',
    cityId,
    cityName: '海港市',
    presence,
  };
}

/**
 * 對手主動行為。
 *
 * 原本 `presence` 開局 0.4 之後永遠不變，玩家吃下市場也不會有人反應。
 * 現在對手會依玩家整體市佔加碼或退場 —— 形成「主導市場會被反撲」的張力。
 */
describe('對手主動行為', () => {
  it('市佔低於門檻時不加碼', () => {
    const { rivals, countered } = respondToPlayerShare([rival(0.4)], 0.05);
    expect(countered).toHaveLength(0);
    expect(rivals[0]!.presence).toBeCloseTo(0.4, 10);
  });

  it('市佔超過門檻時對手加碼', () => {
    const { rivals, countered } = respondToPlayerShare(
      [rival(0.4)],
      RIVAL_COUNTER_THRESHOLD + 0.05,
    );
    expect(countered).toHaveLength(1);
    expect(rivals[0]!.presence).toBeGreaterThan(0.4);
  });

  it('市佔越高，加碼越猛', () => {
    const mild = respondToPlayerShare([rival(0.4)], RIVAL_COUNTER_THRESHOLD + 0.02).rivals[0]!;
    const heavy = respondToPlayerShare([rival(0.4)], RIVAL_COUNTER_THRESHOLD + 0.3).rivals[0]!;
    expect(heavy.presence).toBeGreaterThan(mild.presence);
  });

  it('presence 不會超過上限', () => {
    let current = rival(0.4);
    for (let day = 0; day < 100; day += 1) {
      current = respondToPlayerShare([current], 1).rivals[0]!;
    }
    expect(current.presence).toBeLessThanOrEqual(RIVAL_PRESENCE_CAP + 1e-9);
    expect(current.presence).toBeCloseTo(RIVAL_PRESENCE_CAP, 6);
  });

  it('市佔回落時對手退場，但不會低於基準值', () => {
    let current = respondToPlayerShare([rival(0.4)], 0.5).rivals[0]!;
    expect(current.presence).toBeGreaterThan(0.4);
    for (let day = 0; day < 200; day += 1) {
      current = respondToPlayerShare([current], 0).rivals[0]!;
    }
    expect(current.presence).toBeCloseTo(RIVAL_BASE_PRESENCE, 6);
  });

  it('多個城市會一起反應', () => {
    const rivals = [rival(0.4, 'c1'), rival(0.4, 'c2'), rival(0.4, 'c3')];
    const { countered } = respondToPlayerShare(rivals, 0.5);
    expect(countered).toHaveLength(3);
  });

  it('沒有對手時安全回傳空結果', () => {
    const result = respondToPlayerShare([], 0.9);
    expect(result.rivals).toHaveLength(0);
    expect(result.countered).toHaveLength(0);
  });

  it('反應是決定性的（同輸入同輸出）', () => {
    const a = respondToPlayerShare([rival(0.4)], 0.33);
    const b = respondToPlayerShare([rival(0.4)], 0.33);
    expect(a.rivals[0]!.presence).toBe(b.rivals[0]!.presence);
  });

  it('不改變對手的識別資訊', () => {
    const before = rival(0.4);
    const after = respondToPlayerShare([before], 0.5).rivals[0]!;
    expect(after.id).toBe(before.id);
    expect(after.cityId).toBe(before.cityId);
    expect(after.nameZh).toBe(before.nameZh);
  });
});
