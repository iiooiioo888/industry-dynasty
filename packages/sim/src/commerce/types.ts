import type { ContractBid } from './bidding.js';
import type { QualityBand } from './quality.js';
import type { ItemId } from '../production/items.js';

export type StaffRole = 'operator' | 'clerk' | 'researcher';

export interface StaffRoster {
  readonly operators: number;
  readonly clerks: number;
  readonly researchers: number;
  /**
   * 各職種熟練度（0–100）。舊存檔沒有這個欄位，讀取時視為 0。
   * 在職就會累積，效果見 `commerce/staff.ts`。
   */
  readonly skill?: Readonly<Record<StaffRole, number>>;
}

export interface ShelfListing {
  readonly parcelId: string;
  readonly itemId: ItemId;
  readonly unitPrice: number;
  readonly quantity: number;
}

export type ContractStatus = 'open' | 'shipping' | 'fulfilled' | 'lapsed';

export interface CityContract {
  readonly id: string;
  readonly cityId: string;
  readonly cityName: string;
  readonly itemId: ItemId;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly dueDay: number;
  readonly status: ContractStatus;
  readonly penalty: number;
  readonly penalized: boolean;
  readonly shipFromParcelId?: string;
  /**
   * 對手的單價（市場行情）。玩家出價必須 ≤ 這個值才標得到。
   * 舊存檔沒有這個欄位時視為面價（等於沒有競爭）。
   */
  readonly rivalUnitPrice?: number;
}

export interface ResearchJob {
  readonly id: string;
  readonly parcelId: string;
  readonly progressTicks: number;
  readonly totalTicks: number;
  readonly spent: number;
}

export interface AdCampaign {
  readonly cityId: string;
  readonly cityName: string;
  readonly remainingDays: number;
  readonly demandBonus: number;
}

export type WorldEventKind = 'freight-up' | 'city-demand-up' | 'port-raw-down';

export interface WorldEvent {
  readonly id: string;
  readonly kind: WorldEventKind;
  readonly headline: string;
  readonly remainingDays: number;
  readonly magnitude: number;
  readonly cityId?: string;
  readonly cityName?: string;
}

export interface RivalOutlet {
  readonly id: string;
  readonly nameZh: string;
  readonly cityId: string;
  readonly cityName: string;
  /** 0–1，該城消費品需求裡對手先拿走的比例。 */
  readonly presence: number;
}

export interface CommerceState {
  readonly shelves: readonly ShelfListing[];
  readonly contracts: readonly CityContract[];
  readonly staff: StaffRoster;
  readonly research: ResearchJob | null;
  readonly unlocked: readonly string[];
  readonly qualityBand: QualityBand;
  readonly campaigns: readonly AdCampaign[];
  readonly events: readonly WorldEvent[];
  readonly rivals: readonly RivalOutlet[];
  /** 掌櫃自己的擴張資金，不進玩家現金。 */
  readonly npcTreasury?: Readonly<Record<string, number>>;
  readonly consumerRevenue: number;
  readonly addressableValue: number;
  readonly wagesPaid: number;
  readonly penaltiesPaid: number;
  /** 玩家對合約的出價（見 commerce/bidding.ts） */
  readonly contractBids?: readonly ContractBid[];
}

export const EMPTY_STAFF: StaffRoster = {
  operators: 0,
  clerks: 0,
  researchers: 0,
};
