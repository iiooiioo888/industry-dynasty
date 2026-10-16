export interface PnLSummary {
  readonly revenue: number;
  readonly taxPaid: number;
  readonly maintenance: number;
  readonly transportCost: number;
  readonly auctionSpend: number;
  readonly buildSpend: number;
  readonly productionIdleLoss: number;
}

export function emptyPnL(): PnLSummary {
  return {
    revenue: 0,
    taxPaid: 0,
    maintenance: 0,
    transportCost: 0,
    auctionSpend: 0,
    buildSpend: 0,
    productionIdleLoss: 0,
  };
}

export function netProfit(pnl: PnLSummary): number {
  return (
    pnl.revenue -
    pnl.taxPaid -
    pnl.maintenance -
    pnl.transportCost -
    pnl.auctionSpend -
    pnl.buildSpend -
    pnl.productionIdleLoss
  );
}

export function addPnL(base: PnLSummary, delta: Partial<PnLSummary>): PnLSummary {
  return {
    revenue: base.revenue + (delta.revenue ?? 0),
    taxPaid: base.taxPaid + (delta.taxPaid ?? 0),
    maintenance: base.maintenance + (delta.maintenance ?? 0),
    transportCost: base.transportCost + (delta.transportCost ?? 0),
    auctionSpend: base.auctionSpend + (delta.auctionSpend ?? 0),
    buildSpend: base.buildSpend + (delta.buildSpend ?? 0),
    productionIdleLoss: base.productionIdleLoss + (delta.productionIdleLoss ?? 0),
  };
}
