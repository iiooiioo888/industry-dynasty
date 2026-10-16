import { addPnL, emptyPnL } from '../sales/pnl.js';
import type { WorldState } from './state.js';

export function bumpPlayerPnl(
  state: WorldState,
  playerId: string,
  delta: Parameters<typeof addPnL>[1],
): WorldState['pnl'] {
  const current = state.pnl[playerId] ?? emptyPnL();
  return { ...state.pnl, [playerId]: addPnL(current, delta) };
}
