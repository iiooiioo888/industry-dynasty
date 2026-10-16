import { DEFAULT_BANK_CONFIG, type BankConfig } from '../bank/config.js';
import { HOLDING } from '../balance/targets.js';

export interface WorldConfig {
  readonly mapWidth: number;
  readonly mapHeight: number;
  readonly startingCash: number;
  readonly playerId: string;
  readonly playerName: string;
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
  startingCash: 100_000,
  playerId: 'player-1',
  playerName: '在地企業家',
  landTaxPerTick: HOLDING.landTaxPerParcelPerDay,
  landTaxReauctionThreshold: HOLDING.landTaxPerParcelPerDay * 3,
  auctionMinPriceBase: 800,
  auctionMinPriceStep: 40,
  bank: DEFAULT_BANK_CONFIG,
};
