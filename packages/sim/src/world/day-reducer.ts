import { addPnL, emptyPnL } from '../sales/pnl.js';
import type { WorldConfig } from './config.js';
import type { WorldState } from './state.js';
import { applyTaxTick } from './tax-apply.js';

export function applyTaxTickWithPnl(state: WorldState, config: WorldConfig): WorldState {
  const before = state.players[state.localPlayerId]?.cash ?? 0;
  const next = applyTaxTick(state, config);
  const after = next.players[state.localPlayerId]?.cash ?? 0;
  const taxPaid = Math.max(0, before - after);

  const playerId = state.localPlayerId;
  const pnl = addPnL(next.pnl[playerId] ?? emptyPnL(), { taxPaid });

  return {
    ...next,
    pnl: { ...next.pnl, [playerId]: pnl },
  };
}
