/**
 * 伺服器權威意圖處理占位（Sprint 0）。
 * 未來：客戶端提交 intent → 驗證 → 套用至 sim 狀態 → 廣播。
 */
export type PlayerIntent =
  | { type: 'noop' }
  | { type: 'ping'; clientTime: number };

export interface IntentResult {
  accepted: boolean;
  message?: string;
}

export function handlePlayerIntent(intent: PlayerIntent): IntentResult {
  switch (intent.type) {
    case 'noop':
      return { accepted: true };
    case 'ping':
      return { accepted: true, message: `pong@${intent.clientTime}` };
    default:
      return { accepted: false, message: 'unknown intent' };
  }
}
