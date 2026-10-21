import { describe, expect, it } from 'vitest';
import { grantBuildMaterials } from '../buildings/materials.js';
import { FACTORY_TYPES } from '../buildings/catalog.js';
import { emptyPnL, netProfit } from '../sales/pnl.js';
import { parcelIdFromCoords } from '../types/map.js';
import { SIM_TICKS_PER_DAY } from '../world/clock.js';
import { createInitialWorld } from '../world/create-world.js';
import { applyWorldAction } from '../world/reducer.js';
import { findOpenLotForParcel, getProductionLine } from '../world/state.js';
import { ITEMS } from './items.js';
import { projectLine } from './line-economy.js';
import { MACHINE_GRADES, type MachineGradeId } from './machines.js';
import { RECIPES } from './recipes.js';
import { generateParcelResource } from '../world/parcel-resources.js';

const DAYS = 2;
const TICKS = SIM_TICKS_PER_DAY * DAYS;

function bareParcel(x: number, y: number) {
  return {
    id: parcelIdFromCoords(x, y),
    x,
    y,
    state: 'building-ready' as const,
    ownerId: 'p',
    resource: generateParcelResource(x, y),
    role: 'land' as const,
    populationDensity: 20,
    roadAccess: 1,
    cityProximity: 1,
    nearestCityName: null,
    nearestCityDistance: 0,
  };
}

function runMounted(
  x: number,
  y: number,
  factory: 'workshop' | 'assembly-plant',
  recipe: 'make-basic-part' | 'make-alloy-plate' | 'extract-iron',
  machine: MachineGradeId | null,
  stock: Record<string, number>,
) {
  let state = createInitialWorld({ startingCash: 500_000 });
  const parcelId = parcelIdFromCoords(x, y);
  const lot = findOpenLotForParcel(state, parcelId)!;
  state = applyWorldAction(state, { type: 'BID', parcelId, amount: lot.minPrice });
  state = applyWorldAction(state, { type: 'SETTLE_AUCTION', parcelId });
  // 建廠要吃材料；這個測試專心測機械檔位，所以直接補齊。
  state = {
    ...state,
    inventories: {
      ...state.inventories,
      [state.localPlayerId]: grantBuildMaterials(state.inventories[state.localPlayerId], factory),
    },
  };
  state = applyWorldAction(state, { type: 'START_BUILD', parcelId, factoryTypeId: factory });
  for (let i = 0; i < FACTORY_TYPES[factory].buildTimeTicks; i += 1) {
    state = applyWorldAction(state, { type: 'ADVANCE_BUILD_TICK' });
  }
  state = {
    ...state,
    inventories: { [state.localPlayerId]: stock },
  };
  const before = state.players[state.localPlayerId]!.cash;
  state = applyWorldAction(state, {
    type: 'START_PRODUCTION',
    parcelId,
    recipeId: recipe,
    ...(machine ? { machineGradeId: machine } : {}),
  });
  const paid = before - state.players[state.localPlayerId]!.cash;
  for (let i = 0; i < TICKS; i += 1) {
    state = applyWorldAction(state, { type: 'ADVANCE_PRODUCTION_TICK' });
  }
  const line = getProductionLine(state, parcelId)!;
  const pnl = state.pnl[state.localPlayerId] ?? emptyPnL();
  return {
    state,
    line,
    paid,
    score: line.totalOutputValue - pnl.maintenance - pnl.buildSpend - line.totalIdleLossValue,
    itemId: RECIPES[line.recipeId].outputItemId,
  };
}

describe('加工機械', () => {
  const near = bareParcel(1, 0);
  const far = bareParcel(12, 10);
  const plate = RECIPES['make-alloy-plate'];
  const part = RECIPES['make-basic-part'];

  it('三檔產品 SKU 相同，短路程成品是高效 > 標準 > 基礎', () => {
    const grades = [null, 'anvil-bench', 'balance-press', 'neighbor-kiln'] as const;
    const outputs = grades.map((grade) => projectLine(plate, near, 1, grade, 1));
    expect(new Set(outputs.map(() => plate.outputItemId)).size).toBe(1);
    expect(ITEMS[plate.outputItemId].id).toBe('alloy-plate');
    const anvil = projectLine(plate, near, 1, 'anvil-bench', 1).profitPerTick;
    const press = projectLine(plate, near, 1, 'balance-press', 1).profitPerTick;
    const kiln = projectLine(plate, near, 1, 'neighbor-kiln', 1).profitPerTick;
    expect(kiln).toBeGreaterThan(press);
    expect(press).toBeGreaterThan(anvil);
    expect(projectLine(plate, near, 1, 'neighbor-kiln', 1).pathGated).toBe(false);
  });

  it('路程超過門檻時，高效爐比粗砧台更差', () => {
    const kiln = projectLine(plate, far, 1, 'neighbor-kiln', 1);
    const anvil = projectLine(plate, far, 1, 'anvil-bench', 1);
    expect(kiln.pathGated).toBe(true);
    expect(anvil.profitPerTick).toBeGreaterThan(kiln.profitPerTick);
    expect(projectLine(part, far, 1, 'anvil-bench', 1).profitPerTick).toBeGreaterThan(
      projectLine(part, far, 1, 'neighbor-kiln', 1).profitPerTick,
    );
  });

  it('兩日模擬：近址選對爐賺更多，遠址選錯爐更虧，開採裝爐不會加速', () => {
    const stock = { 'raw-ore': 800, 'basic-part': 400, resin: 400 };
    const nearKiln = runMounted(1, 0, 'assembly-plant', 'make-alloy-plate', 'neighbor-kiln', stock);
    const nearPress = runMounted(
      1,
      0,
      'assembly-plant',
      'make-alloy-plate',
      'balance-press',
      stock,
    );
    const nearAnvil = runMounted(1, 0, 'assembly-plant', 'make-alloy-plate', 'anvil-bench', stock);
    expect(nearKiln.itemId).toBe(nearPress.itemId);
    expect(nearPress.itemId).toBe(nearAnvil.itemId);
    expect(nearKiln.itemId).toBe('alloy-plate');
    expect(nearKiln.paid).toBe(MACHINE_GRADES['neighbor-kiln'].installCost);
    expect(nearAnvil.paid).toBe(0);
    expect(nearKiln.line.completedRuns).toBeGreaterThan(nearPress.line.completedRuns);
    expect(nearPress.line.completedRuns).toBeGreaterThan(nearAnvil.line.completedRuns);
    expect(nearKiln.score).toBeGreaterThan(nearPress.score);
    expect(nearPress.score).toBeGreaterThan(nearAnvil.score);

    const farKiln = runMounted(
      12,
      10,
      'assembly-plant',
      'make-alloy-plate',
      'neighbor-kiln',
      stock,
    );
    const farAnvil = runMounted(12, 10, 'assembly-plant', 'make-alloy-plate', 'anvil-bench', stock);
    expect(farAnvil.score).toBeGreaterThan(farKiln.score);
    expect(farKiln.line.pathGated).toBe(true);
    const farPnlKiln = farKiln.state.pnl[farKiln.state.localPlayerId] ?? emptyPnL();
    const farPnlAnvil = farAnvil.state.pnl[farAnvil.state.localPlayerId] ?? emptyPnL();
    expect(farPnlKiln.maintenance).toBeGreaterThan(farPnlAnvil.maintenance);

    const iron = createInitialWorld({ startingCash: 500_000 })
      .map.parcels.filter(
        (parcel) =>
          parcel.role === 'land' && parcel.resource.kind === 'iron-vein' && parcel.x + parcel.y > 0,
      )
      .sort((a, b) => a.x + a.y - (b.x + b.y))[0]!;
    const mineKiln = runMounted(iron.x, iron.y, 'workshop', 'extract-iron', 'neighbor-kiln', stock);
    const mineBare = runMounted(iron.x, iron.y, 'workshop', 'extract-iron', null, stock);
    expect(mineKiln.line.machineGradeId).toBeNull();
    expect(mineKiln.paid).toBe(0);
    expect(mineKiln.line.cycleTicks).toBe(mineBare.line.cycleTicks);
    expect(mineKiln.itemId).toBe('raw-ore');
    void netProfit;
  });

  it('升級只補差額，降檔不退費但保留已付額度', () => {
    let state = createInitialWorld({ startingCash: 500_000 });
    const parcelId = parcelIdFromCoords(1, 0);
    const lot = findOpenLotForParcel(state, parcelId)!;
    state = applyWorldAction(state, { type: 'BID', parcelId, amount: lot.minPrice });
    state = applyWorldAction(state, { type: 'SETTLE_AUCTION', parcelId });
    state = applyWorldAction(state, {
      type: 'START_BUILD',
      parcelId,
      factoryTypeId: 'workshop',
    });
    for (let i = 0; i < FACTORY_TYPES.workshop.buildTimeTicks; i += 1) {
      state = applyWorldAction(state, { type: 'ADVANCE_BUILD_TICK' });
    }
    state = {
      ...state,
      inventories: { [state.localPlayerId]: { 'raw-ore': 40, resin: 40 } },
    };
    state = applyWorldAction(state, {
      type: 'START_PRODUCTION',
      parcelId,
      recipeId: 'make-basic-part',
      machineGradeId: 'anvil-bench',
    });
    const before = state.players[state.localPlayerId]!.cash;
    state = applyWorldAction(state, {
      type: 'INSTALL_MACHINE',
      parcelId,
      machineGradeId: 'neighbor-kiln',
    });
    expect(before - state.players[state.localPlayerId]!.cash).toBe(
      MACHINE_GRADES['neighbor-kiln'].installCost,
    );
    expect(getProductionLine(state, parcelId)!.machineGradeId).toBe('neighbor-kiln');
    expect(getProductionLine(state, parcelId)!.recipeId).toBe('make-basic-part');
    const credited = state.players[state.localPlayerId]!.cash;
    state = applyWorldAction(state, {
      type: 'INSTALL_MACHINE',
      parcelId,
      machineGradeId: 'balance-press',
    });
    expect(state.players[state.localPlayerId]!.cash).toBe(credited);
    expect(getProductionLine(state, parcelId)!.machinePaid).toBe(
      MACHINE_GRADES['neighbor-kiln'].installCost,
    );
  });
});
