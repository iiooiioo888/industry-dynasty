import { describe, expect, it } from 'vitest';
import { DEFAULT_CUE_VOLUME, cueForAction, cueForBuildCompletion } from './cues.js';
import { createInitialWorld } from '../world/create-world.js';
import { applyWorldAction } from '../world/reducer.js';
import { findOpenLotForParcel } from '../world/state.js';
import type { WorldState } from '../world/state.js';

/**
 * 音效提示規則。
 *
 * 最關鍵的一條：**失敗的動作不能發出成功音**。玩家需要靠聲音分辨
 * 「我做成了」與「我按了但沒用」。
 */
function ownFirstParcel(state: WorldState) {
  const parcel = state.map.parcels
    .filter((p) => p.role === 'land' && p.ownerId === null)
    .find((p) => findOpenLotForParcel(state, p.id) !== undefined)!;
  const lot = findOpenLotForParcel(state, parcel.id)!;
  let next = applyWorldAction(state, { type: 'BID', parcelId: parcel.id, amount: lot.minPrice });
  next = applyWorldAction(next, { type: 'SETTLE_AUCTION', parcelId: parcel.id });
  return { state: next, parcelId: parcel.id, lot };
}

describe('音效提示', () => {
  it('出價成功給出價音', () => {
    const state = createInitialWorld();
    const parcel = state.map.parcels.find(
      (p) => p.role === 'land' && findOpenLotForParcel(state, p.id) !== undefined,
    )!;
    const lot = findOpenLotForParcel(state, parcel.id)!;
    const after = applyWorldAction(state, {
      type: 'BID',
      parcelId: parcel.id,
      amount: lot.minPrice,
    });
    expect(
      cueForAction({ type: 'BID', parcelId: parcel.id, amount: lot.minPrice }, state, after),
    ).toBe('bid');
  });

  it('無效出價給錯誤音（不會誤報成功）', () => {
    const state = createInitialWorld();
    const parcel = state.map.parcels.find((p) => p.role === 'land')!;
    // 沒有開放中的拍賣 → 動作不會改變狀態
    const after = applyWorldAction(state, { type: 'BID', parcelId: parcel.id, amount: 1 });
    expect(after).toBe(state);
    expect(cueForAction({ type: 'BID', parcelId: parcel.id, amount: 1 }, state, after)).toBe(
      'error',
    );
  });

  it('時間推進不發聲音（否則會一直響）', () => {
    const state = createInitialWorld();
    for (const type of ['ADVANCE_SIM_TIME', 'SET_CLOCK'] as const) {
      const action =
        type === 'ADVANCE_SIM_TIME'
          ? ({ type, deltaMs: 16 } as const)
          : ({ type, paused: true } as const);
      expect(cueForAction(action, state, state)).toBeNull();
    }
  });

  it('通關與失敗各自有專屬音效，且優先於其他判定', () => {
    const state = createInitialWorld();
    const won: WorldState = { ...state, scenario: { ...state.scenario, status: 'won' } };
    const lost: WorldState = { ...state, scenario: { ...state.scenario, status: 'lost' } };
    const action = { type: 'ADVANCE_DAY' } as const;
    expect(cueForAction(action, state, won)).toBe('stage-won');
    expect(cueForAction(action, state, lost)).toBe('stage-lost');
  });

  it('日結有進帳給現金音，沒有進帳給日結音', () => {
    const state = createInitialWorld();
    const richer: WorldState = {
      ...state,
      players: {
        ...state.players,
        [state.localPlayerId]: { ...state.players[state.localPlayerId]!, cash: 999_999 },
      },
    };
    const action = { type: 'ADVANCE_DAY' } as const;
    expect(cueForAction(action, state, richer)).toBe('cash-in');
    expect(cueForAction(action, state, { ...state, gameDay: 1 })).toBe('day-close');
  });

  it('接單失敗（沒投標）給失敗音', () => {
    const state = createInitialWorld();
    const contract = state.commerce?.contracts?.[0];
    expect(contract).toBeDefined();
    const after = applyWorldAction(state, {
      type: 'ACCEPT_CONTRACT',
      contractId: contract!.id,
      shipFromParcelId: state.map.parcels[0]!.id,
    });
    expect(
      cueForAction(
        {
          type: 'ACCEPT_CONTRACT',
          contractId: contract!.id,
          shipFromParcelId: state.map.parcels[0]!.id,
        },
        state,
        after,
      ),
    ).toBe('deal-lost');
  });

  it('建廠成功與失敗分得出來', () => {
    const owned = ownFirstParcel(createInitialWorld());
    const action = {
      type: 'START_BUILD',
      parcelId: owned.parcelId,
      factoryTypeId: 'workshop',
    } as const;
    const built = applyWorldAction(owned.state, action);
    expect(cueForAction(action, owned.state, built)).toBe('build-start');

    // 同一塊地再蓋一次 → 無效
    const again = applyWorldAction(built, action);
    expect(cueForAction(action, built, again)).toBe('error');
  });

  it('建造完工另外判定', () => {
    const owned = ownFirstParcel(createInitialWorld());
    const built = applyWorldAction(owned.state, {
      type: 'START_BUILD',
      parcelId: owned.parcelId,
      factoryTypeId: 'workshop',
    });
    expect(cueForBuildCompletion(owned.state, built)).toBeNull();

    let current = built;
    let completion: string | null = null;
    for (let tick = 0; tick < 40; tick += 1) {
      const next = applyWorldAction(current, { type: 'ADVANCE_BUILD_TICK' });
      const cue = cueForBuildCompletion(current, next);
      if (cue) {
        completion = cue;
        break;
      }
      current = next;
    }
    expect(completion).toBe('build-done');
  });

  it('音量預設值在合理範圍', () => {
    expect(DEFAULT_CUE_VOLUME).toBeGreaterThan(0);
    expect(DEFAULT_CUE_VOLUME).toBeLessThanOrEqual(1);
  });
});
