export interface PnLSummary {
  readonly revenue: number;
  /** 土地轉手收入（與販售貨物的 revenue 分開，方便看出地產操作的貢獻） */
  readonly landSaleProceeds: number;
  readonly taxPaid: number;
  readonly maintenance: number;
  readonly transportCost: number;
  readonly auctionSpend: number;
  readonly buildSpend: number;
  readonly productionIdleLoss: number;
  /** 薪資與聘僱費。舊報表缺這欄時視同 0。 */
  readonly wages?: number;
}

export function emptyPnL(): PnLSummary {
  return {
    revenue: 0,
    landSaleProceeds: 0,
    taxPaid: 0,
    maintenance: 0,
    transportCost: 0,
    auctionSpend: 0,
    buildSpend: 0,
    productionIdleLoss: 0,
    wages: 0,
  };
}

export function netProfit(pnl: PnLSummary): number {
  return (
    pnl.revenue +
    pnl.landSaleProceeds -
    pnl.taxPaid -
    pnl.maintenance -
    pnl.transportCost -
    pnl.auctionSpend -
    pnl.buildSpend -
    pnl.productionIdleLoss -
    (pnl.wages ?? 0)
  );
}

export function addPnL(base: PnLSummary, delta: Partial<PnLSummary>): PnLSummary {
  return {
    revenue: base.revenue + (delta.revenue ?? 0),
    landSaleProceeds: base.landSaleProceeds + (delta.landSaleProceeds ?? 0),
    taxPaid: base.taxPaid + (delta.taxPaid ?? 0),
    maintenance: base.maintenance + (delta.maintenance ?? 0),
    transportCost: base.transportCost + (delta.transportCost ?? 0),
    auctionSpend: base.auctionSpend + (delta.auctionSpend ?? 0),
    buildSpend: base.buildSpend + (delta.buildSpend ?? 0),
    productionIdleLoss: base.productionIdleLoss + (delta.productionIdleLoss ?? 0),
    wages: (base.wages ?? 0) + (delta.wages ?? 0),
  };
}
