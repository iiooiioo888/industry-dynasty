import {
  applyWorldAction,
  createInitialWorld,
  type WorldAction,
  type WorldState,
} from '@industry-dynasty/sim';

/**
 * 伺服器權威意圖處理（Sprint 1：委派至 packages/sim）。
 */
export type PlayerIntent =
  | { type: 'noop' }
  | { type: 'ping'; clientTime: number }
  | { type: 'world'; action: WorldAction };

export interface IntentResult {
  accepted: boolean;
  message?: string;
  state?: WorldState;
}

let sessionState: WorldState = createInitialWorld();

export function getSessionWorldState(): WorldState {
  return sessionState;
}

export function resetSessionWorldState(): void {
  sessionState = createInitialWorld();
}

export function handlePlayerIntent(intent: PlayerIntent): IntentResult {
  switch (intent.type) {
    case 'noop':
      return { accepted: true };
    case 'ping':
      return { accepted: true, message: `pong@${intent.clientTime}` };
    case 'world': {
      const next = applyWorldAction(sessionState, intent.action);
      const changed = next !== sessionState;
      sessionState = next;
      return {
        accepted: changed,
        message: changed ? 'applied' : 'rejected or no-op',
        state: next,
      };
    }
    default:
      return { accepted: false, message: 'unknown intent' };
  }
}
