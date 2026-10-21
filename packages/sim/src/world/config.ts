import { DEFAULT_BANK_CONFIG, type BankConfig } from '../bank/config.js';
import { FIRST_STAGE, stageById } from '../balance/stages.js';
import { HOLDING } from '../balance/targets.js';

export interface WorldConfig {
  readonly mapWidth: number;
  readonly mapHeight: number;
  readonly startingCash: number;
  readonly playerId: string;
  readonly playerName: string;
  /**
   * 進行中的關卡（見 `balance/stages.ts`）。
   * 決定通關目標組與天數上限；`startingCash` 若沒特別指定就採用關卡值。
   */
  readonly stageId: string;
  /** 每個稅務週期、每塊持有土地的稅額 */
  readonly landTaxPerTick: number;
  /**
   * 單一土地「累計欠稅」達此金額即遭收回並重新進入拍賣池。
   * 預設為三個週期的稅額（若玩家現金不足以繳稅）。
   */
  readonly landTaxReauctionThreshold: number;
  /** 新上架土地的底價計算：base + (x + y) * step */
  readonly auctionMinPriceBase: number;
  readonly auctionMinPriceStep: number;
  readonly bank: BankConfig;
}

export const DEFAULT_WORLD_CONFIG: WorldConfig = {
  mapWidth: 16,
  mapHeight: 12,
  startingCash: FIRST_STAGE.startingCash,
  playerId: 'player-1',
  playerName: '在地企業家',
  stageId: FIRST_STAGE.id,
  landTaxPerTick: HOLDING.landTaxPerParcelPerDay,
  landTaxReauctionThreshold: HOLDING.landTaxPerParcelPerDay * 3,
  auctionMinPriceBase: 800,
  auctionMinPriceStep: 40,
  bank: DEFAULT_BANK_CONFIG,
};

/**
 * 以某一關開新局。
 *
 * 關卡決定起始資金與目標組 —— 呼叫端不必自己抄一份數字，
 * 也就不會出現「關卡表改了、開局沒跟著改」的不一致。
 */
export function stageWorldConfig(stageId: string): WorldConfig {
  const stage = stageById(stageId) ?? FIRST_STAGE;
  return { ...DEFAULT_WORLD_CONFIG, stageId: stage.id, startingCash: stage.startingCash };
}
