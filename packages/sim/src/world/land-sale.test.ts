import { describe, expect, it } from 'vitest';
import { applyWorldAction } from './reducer.js';
import { createInitialWorld } from './create-world.js';
import { findOpenLotForParcel, findParcel } from './state.js';
import { appraiseParcel, quoteLandSale } from './land-sale.js';
import { LAND_MARKET, landBreakEvenDays } from '../balance/targets.js';
import { DEFAULT_WORLD_CONFIG } from './config.js';
import { FACTORY_TYPES } from '../buildings/catalog.js';

function buyCheapestParcel(state: ReturnType<typeof createInitialWorld>) {
  const cand = state.map.parcels
    .filter((p) => p.role === 'land' && p.ownerId === null)
    .map((p) => ({ p, lot: findOpenLotForParcel(state, p.id) }))
    .filter((c) => c.lot)
    .sort((a, b) => a.lot!.minPrice - b.lot!.minPrice)[0]!;
  let next = applyWorldAction(state, {
    type: 'BID',
    parcelId: cand.p.id,
    amount: cand.lot!.minPrice,
  });
  next = applyWorldAction(next, { type: 'SETTLE_AUCTION', parcelId: cand.p.id });
  return { state: next, parcelId: cand.p.id, paid: cand.lot!.minPrice };
}

describe('土地轉手（圈地投機的出口）', () => {
  it('可以買地再賣地，現金與 PnL 都正確', () => {
    const start = createInitialWorld({ startingCash: 100_000 });
    const { state: owned, parcelId, paid } = buyCheapestParcel(start);
    const cashAfterBuy = owned.players[owned.localPlayerId]!.cash;

    // 立刻轉手：因為要折價，必然虧損（不能零風險套利）
    const sold = applyWorldAction(owned, { type: 'SELL_LAND', parcelId });
    const parcel = findParcel(sold, parcelId)!;

    expect(parcel.ownerId).toBeNull();
    expect(parcel.state).toBe('empty');
    expect(sold.pnl[sold.localPlayerId]!.landSaleProceeds).toBeGreaterThan(0);
    expect(sold.players[sold.localPlayerId]!.cash).toBeGreaterThan(cashAfterBuy);
    console.log(
      `\n  買價 ${paid} → 立刻轉手得 ${sold.pnl[sold.localPlayerId]!.landSaleProceeds}（虧損 ${paid - sold.pnl[sold.localPlayerId]!.landSaleProceeds}）`,
    );
  });

  it('持有夠久才轉手才會獲利 —— 這就是這個機制的手感', () => {
    const { state: owned, parcelId } = buyCheapestParcel(
      createInitialWorld({ startingCash: 100_000 }),
    );
    const config = DEFAULT_WORLD_CONFIG;
    const parcel = findParcel(owned, parcelId)!;
    const buyPrice = appraiseParcel(parcel, config, 0);

    const days = landBreakEvenDays();
    console.log(
      `\n  回本天數 = ${days}（轉手折價 ${(1 - LAND_MARKET.resaleRate) * 100}%、地價日成長 ${LAND_MARKET.appreciationPerDay * 100}%）`,
    );

    // 回本天數之前賣掉會虧
    const early = quoteLandSale(parcel, owned.localPlayerId, config, days - 1, false);
    expect(early.ok).toBe(true);
    expect(early.proceeds).toBeLessThan(buyPrice);

    // 回本天數之後賣掉才賺
    const late = quoteLandSale(parcel, owned.localPlayerId, config, days + 5, false);
    expect(late.proceeds).toBeGreaterThan(buyPrice);
    console.log(
      `  第 ${days - 1} 天賣 ${early.proceeds}（< 買價 ${Math.round(buyPrice)}）` +
        ` / 第 ${days + 5} 天賣 ${late.proceeds}（> 買價）`,
    );
  });

  it('地上有建築時不能轉手，必須先拆除', () => {
    const { state: owned, parcelId } = buyCheapestParcel(
      createInitialWorld({ startingCash: 100_000 }),
    );
    const built = applyWorldAction(owned, {
      type: 'START_BUILD',
      parcelId,
      factoryTypeId: 'workshop',
    });
    expect(built.sites[parcelId.value]).toBeDefined();

    const blocked = applyWorldAction(built, { type: 'SELL_LAND', parcelId });
    const quote = quoteLandSale(
      findParcel(built, parcelId)!,
      built.localPlayerId,
      DEFAULT_WORLD_CONFIG,
      0,
      true,
    );
    expect(quote.ok).toBe(false);
    expect(quote.reason).toContain('拆除');
    // 被拒絕時狀態不應改變
    expect(blocked).toBe(built);
  });

  it('不是自己的地不能轉手', () => {
    const state = createInitialWorld({ startingCash: 100_000 });
    const unowned = state.map.parcels.find((p) => p.role === 'land' && p.ownerId === null)!;
    const quote = quoteLandSale(unowned, state.localPlayerId, DEFAULT_WORLD_CONFIG, 0, false);
    expect(quote.ok).toBe(false);
    const after = applyWorldAction(state, { type: 'SELL_LAND', parcelId: unowned.id });
    expect(after).toBe(state);
  });

  it('拆除工廠後才能轉手，且土地回到拍賣池', () => {
    const { state: owned, parcelId } = buyCheapestParcel(
      createInitialWorld({ startingCash: 100_000 }),
    );
    let state = applyWorldAction(owned, {
      type: 'START_BUILD',
      parcelId,
      factoryTypeId: 'workshop',
    });
    for (let i = 0; i < FACTORY_TYPES.workshop.buildTimeTicks; i += 1) {
      state = applyWorldAction(state, { type: 'ADVANCE_BUILD_TICK' });
    }
    expect(state.sites[parcelId.value]?.phase).toBe('complete');

    // 先拆除，再轉手
    state = applyWorldAction(state, { type: 'DEMOLISH', parcelId });
    expect(state.sites[parcelId.value]).toBeUndefined();
    const sold = applyWorldAction(state, { type: 'SELL_LAND', parcelId });
    expect(findParcel(sold, parcelId)!.ownerId).toBeNull();
    expect(sold.pnl[sold.localPlayerId]!.landSaleProceeds).toBeGreaterThan(0);
  });

  it('估價不含礦藏，所以不能「底價買進、含礦價賣出」套利', () => {
    const state = createInitialWorld({ startingCash: 100_000 });
    const config = DEFAULT_WORLD_CONFIG;
    // 找一塊礦藏豐富的地，確認它的估價只反映區位、與礦藏無關
    const richest = [...state.map.parcels]
      .filter((p) => p.role === 'land')
      .sort((a, b) => b.resource.reserves - a.resource.reserves)[0]!;
    const sameLocationBase = appraiseParcel(
      { ...richest, resource: { ...richest.resource, reserves: 0 } },
      config,
      0,
    );
    const withReserves = appraiseParcel(richest, config, 0);
    expect(withReserves).toBe(sameLocationBase);
    console.log(
      `\n  藏量 ${richest.resource.reserves} 的地塊估價 ${withReserves}，` +
        `把藏量歸零後仍是 ${sameLocationBase} → 礦藏不進估價`,
    );
  });
});
