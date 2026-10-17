import { listShipments, settleArrivedShipments } from '../world/shipments.js';
import type { WorldState } from '../world/state.js';

/**
 * 量測迴圈專用：把已派出的貨記到現金與損益，但不推進規劃日。
 *
 * 正式路徑（`ADVANCE_SIM_TIME` → `applyOneSimTick` → `settleArrivedShipments`）
 * 要等模擬時間跨過 `arriveSimMs` 才入帳，而且每 48 刻才經 `settledDayIndex` 日結一次。
 * `full-loop`／機器人模擬仍沿用平衡校準：「一次生產推進 + `ADVANCE_DAY` = 一個經濟日」
 * （見 `balance/targets.ts`）。若為了等出貨把時鐘真的快進，會多跑產線，
 * 並在第 48 刻額外日結，把已校準的毛利放大約一個數量級。
 *
 * 這裡只暫時把 `simMs` 抬到到達時刻，呼叫與正式路徑相同的結算函式，
 * 然後把時鐘與通關狀態放回原位。通關判定仍留給隨後的 `ADVANCE_DAY`
 * （稅與維護入帳之後）決定。
 */
export function recognizeDispatchedShipments(state: WorldState): WorldState {
  const shipments = listShipments(state);
  if (shipments.length === 0) {
    return state;
  }
  const arriveSimMs = shipments.reduce(
    (latest, shipment) => Math.max(latest, shipment.arriveSimMs),
    state.clock.simMs,
  );
  const settled = settleArrivedShipments({
    ...state,
    clock: { ...state.clock, simMs: arriveSimMs },
  });
  return {
    ...settled,
    clock: state.clock,
    scenario: state.scenario,
  };
}
