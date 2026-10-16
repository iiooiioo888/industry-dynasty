export type SaleStatus = 'quoted' | 'accepted' | 'rejected' | 'fulfilled';

/** NPC 收購單 — 玩家將產品賣給 NPC 的占位結構 */
export interface Sale {
  readonly id: string;
  readonly buyerNpcId: string;
  readonly itemId: string;
  readonly quantity: number;
  readonly unitPrice: number;
  readonly status: SaleStatus;
}
