import {
  COMMODITY_LIST,
  DEFAULT_BANK_CONFIG,
  LOAN_PRODUCT_LIST,
  MAINTENANCE_PER_FACTORY,
  STOCK_LIST,
  formatBps,
  getPlayerBank,
  interestOn,
  previewCoupledWeek,
  quoteCommodityAsk,
  quoteCommodityBid,
  quoteStockMove,
  quoteStockSeries,
  summarizeBank,
  validateBuyCommodity,
  validateBuyStock,
  validateDrawLoan,
  validateOpenSavings,
  validateRepayLoan,
  validateSellCommodity,
  validateSellStock,
  COMMODITY_INTAKE,
  validateWithdrawCommodity,
  validateWithdrawSavings,
  type CommodityId,
  type LoanProductId,
  type StockSymbol,
  type WorldState,
} from '@industry-dynasty/sim';
import { useMemo, useState } from 'react';
import './BankPanel.css';

export interface BankPanelProps {
  state: WorldState;
  onOpenSavings: (amount: number) => void;
  onWithdrawSavings: () => void;
  onDrawLoan: (productId: LoanProductId, amount: number) => void;
  onRepayLoan: (loanId: string, amount: number) => void;
  onBuyStock: (symbol: StockSymbol, shares: number) => void;
  onSellStock: (symbol: StockSymbol, shares: number) => void;
  onBuyCommodity: (commodityId: CommodityId, lots: number) => void;
  onSellCommodity: (commodityId: CommodityId, lots: number) => void;
  onWithdrawCommodity: (commodityId: CommodityId, lots: number) => void;
}

type BankTab = 'overview' | 'loans' | 'stocks' | 'wholesale';

const TABS: readonly { id: BankTab; label: string }[] = [
  { id: 'overview', label: '總覽' },
  { id: 'loans', label: '貸款' },
  { id: 'stocks', label: '股票' },
  { id: 'wholesale', label: '大宗' },
];

function money(amount: number): string {
  return `$${amount.toLocaleString()}`;
}

function signedMoney(amount: number): string {
  if (amount > 0) {
    return `+$${amount.toLocaleString()}`;
  }
  if (amount < 0) {
    return `−$${Math.abs(amount).toLocaleString()}`;
  }
  return '$0';
}

function StockSparkline({
  prices,
  tone,
  label,
}: {
  prices: readonly number[];
  tone: string;
  label: string;
}) {
  const width = 128;
  const height = 36;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = max - min || 1;
  const points = prices.map((price, index) => {
    const x = prices.length === 1 ? width / 2 : (index / (prices.length - 1)) * (width - 4) + 2;
    const y = height - 3 - ((price - min) / span) * (height - 8);
    return { x, y };
  });
  const line = points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
  const last = points[points.length - 1];

  return (
    <svg
      className={`stock-spark ${tone}`}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={label}
    >
      <polyline points={line} fill="none" stroke="currentColor" strokeWidth="1.6" />
      {last ? <circle cx={last.x} cy={last.y} r="2.2" fill="currentColor" /> : null}
    </svg>
  );
}

export function BankPanel({
  state,
  onOpenSavings,
  onWithdrawSavings,
  onDrawLoan,
  onRepayLoan,
  onBuyStock,
  onSellStock,
  onBuyCommodity,
  onSellCommodity,
  onWithdrawCommodity,
}: BankPanelProps) {
  const [tab, setTab] = useState<BankTab>('overview');
  const [notice, setNotice] = useState<string | null>(null);
  const [savingsAmount, setSavingsAmount] = useState(10_000);
  const [loanAmounts, setLoanAmounts] = useState<Record<LoanProductId, number>>({
    'working-capital': 5_000,
    construction: 8_000,
  });
  const [shareAmounts, setShareAmounts] = useState<Record<StockSymbol, number>>({
    IRON: 10,
    PORT: 10,
    GRID: 10,
    TOOL: 5,
  });
  const [lotAmounts, setLotAmounts] = useState<Record<CommodityId, number>>({
    copper: 1,
    coal: 1,
    yarn: 1,
    steel: 1,
  });

  const player = state.players[state.localPlayerId];
  const book = getPlayerBank(state, state.localPlayerId);
  const snapshot = useMemo(() => summarizeBank(state), [state]);
  const preview = useMemo(() => previewCoupledWeek(state), [state]);

  function reject(reason: string | undefined) {
    setNotice(reason ?? '無法執行');
  }

  return (
    <section className="sys-panel bank-panel" aria-label="銀行">
      <header className="sys-panel-head bank-heading">
        <span className="sys-panel-tag">BNK</span>
        <h2>銀行</h2>
        <p className="bank-kicker">銀行第 {state.financeTick} 期 · 隨日結前進</p>
      </header>

      <dl className="bank-ledger">
        <div>
          <dt>閒置現金</dt>
          <dd>{money(snapshot.cash)}</dd>
        </div>
        <div>
          <dt>本期預估入息</dt>
          <dd className="money-plus">{signedMoney(preview.settlement.idleInterest)}</dd>
        </div>
        <div>
          <dt>負債</dt>
          <dd className={snapshot.debt > 0 ? 'money-debt' : undefined}>{money(snapshot.debt)}</dd>
        </div>
        <div>
          <dt>淨值</dt>
          <dd>{money(snapshot.netWorth)}</dd>
        </div>
      </dl>

      <div className="bank-tabs" role="tablist" aria-label="銀行分頁">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'overview' ? (
        <div role="tabpanel">
          <p className="bank-rule">
            閒置現金每期自動計息 {formatBps(DEFAULT_BANK_CONFIG.idleInterestBps)}
            ，不必先存入。日結時先扣土地稅與貸款，再入息。
          </p>
          <ul className="bank-breakdown">
            <li>定期本金 {money(snapshot.savingsPrincipal)}</li>
            <li>未入帳利息 {money(snapshot.savingsAccrued)}</li>
            <li>股票市值 {money(snapshot.stockValue)}</li>
            <li>大宗變現 {money(snapshot.commodityBidValue)}</li>
            <li>土地 {money(snapshot.landValue)}</li>
            <li>廠房 {money(snapshot.factoryValue)}</li>
            <li>庫存 {money(snapshot.inventoryValue)}</li>
          </ul>
          {book.lastSettlement ? (
            <p className="panel-hint">
              上期入息 {signedMoney(book.lastSettlement.idleInterest)}
              {book.lastSettlement.savingsPayout > 0
                ? ` · 定期滿期 ${money(book.lastSettlement.savingsPayout)}`
                : ''}
              {book.lastSettlement.loanInterestCharged > 0
                ? ` · 貸款利息 ${money(book.lastSettlement.loanInterestCharged)}`
                : ''}
            </p>
          ) : null}

          <h3>
            定期存款 · {formatBps(DEFAULT_BANK_CONFIG.savingsInterestBps)} ·{' '}
            {DEFAULT_BANK_CONFIG.savingsTermTicks} 期
          </h3>
          <p className="panel-muted">利率高於閒置現金，鎖定期內提前解約只退本金。</p>
          {snapshot.savingsPrincipal > 0 ? (
            <div className="bank-holding">
              <p>
                本金 {money(snapshot.savingsPrincipal)} · 利息 {money(snapshot.savingsAccrued)} ·
                剩餘 {snapshot.savingsPeriodsLeft} 期
              </p>
              <div className="panel-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    const check = validateWithdrawSavings(book);
                    if (!check.ok) {
                      reject(check.reason);
                      return;
                    }
                    onWithdrawSavings();
                    setNotice(
                      snapshot.savingsPeriodsLeft > 0 ? '已提前解約，利息放棄' : '已取出定期本利和',
                    );
                  }}
                >
                  {snapshot.savingsPeriodsLeft > 0 ? '提前解約' : '取出'}
                </button>
              </div>
            </div>
          ) : (
            <>
              <label className="bid-field">
                <span>存入金額</span>
                <input
                  type="number"
                  min={1000}
                  step={1000}
                  value={savingsAmount}
                  onChange={(event) => setSavingsAmount(Number(event.target.value))}
                />
              </label>
              <div className="panel-actions">
                <button
                  type="button"
                  onClick={() => {
                    const check = validateOpenSavings(
                      player,
                      book,
                      savingsAmount,
                      DEFAULT_BANK_CONFIG,
                    );
                    if (!check.ok) {
                      reject(check.reason);
                      return;
                    }
                    onOpenSavings(savingsAmount);
                    setNotice(`已存入定期 ${money(savingsAmount)}，鎖定 4 期`);
                  }}
                >
                  存入定期
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}

      {tab === 'loans' ? (
        <div role="tabpanel">
          <dl className="bank-ledger">
            <div>
              <dt>授信額度</dt>
              <dd>{money(snapshot.creditLimit)}</dd>
            </div>
            <div>
              <dt>可用</dt>
              <dd>{money(snapshot.creditAvailable)}</dd>
            </div>
          </dl>
          {snapshot.creditFrozen ? (
            <p className="panel-warn">有積欠，新貸款暫停。先償還才會恢復授信。</p>
          ) : (
            <p className="panel-muted">貸款利率高於閒置與定期。借來放著會虧，適合趕建廠或買地。</p>
          )}
          <ul className="bank-list">
            {LOAN_PRODUCT_LIST.map((product) => (
              <li key={product.id} className="bank-card">
                <strong>{product.nameZh}</strong>
                <p>
                  {formatBps(product.rateBps)} · {product.termTicks} 期 · {product.blurb}
                </p>
                <label className="bid-field">
                  <span>撥款金額</span>
                  <input
                    type="number"
                    min={1000}
                    step={500}
                    value={loanAmounts[product.id]}
                    onChange={(event) =>
                      setLoanAmounts((current) => ({
                        ...current,
                        [product.id]: Number(event.target.value),
                      }))
                    }
                  />
                </label>
                <div className="panel-actions">
                  <button
                    type="button"
                    disabled={snapshot.creditFrozen}
                    onClick={() => {
                      const amount = loanAmounts[product.id];
                      const check = validateDrawLoan(
                        state,
                        product.id,
                        amount,
                        DEFAULT_BANK_CONFIG,
                      );
                      if (!check.ok) {
                        reject(check.reason);
                        return;
                      }
                      onDrawLoan(product.id, amount);
                      setNotice(`已撥款 ${money(amount)} 到閒置現金`);
                    }}
                  >
                    申請撥款
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <h3>未清償</h3>
          {book.loans.length === 0 ? (
            <p className="panel-muted">目前沒有貸款。</p>
          ) : (
            <ul className="bank-list">
              {book.loans.map((loan) => {
                const product = LOAN_PRODUCT_LIST.find((item) => item.id === loan.productId);
                const debt = loan.principal + loan.arrears;
                const arrearsPay = Math.min(player.cash, loan.arrears);
                const fullPay = Math.min(player.cash, debt);
                return (
                  <li key={loan.id} className="bank-card">
                    <strong>{product?.nameZh ?? loan.productId}</strong>
                    <p>
                      本金 {money(loan.principal)} · 積欠 {money(loan.arrears)} · 剩餘{' '}
                      {loan.ticksRemaining} 期
                    </p>
                    <p className="panel-muted">每期預定還本 {money(loan.installment)}</p>
                    <div className="panel-actions">
                      {loan.arrears > 0 ? (
                        <button
                          type="button"
                          className="secondary"
                          disabled={arrearsPay <= 0}
                          onClick={() => {
                            const check = validateRepayLoan(state, loan.id, arrearsPay);
                            if (!check.ok) {
                              reject(check.reason);
                              return;
                            }
                            onRepayLoan(loan.id, arrearsPay);
                            setNotice(`已償還積欠 ${money(arrearsPay)}`);
                          }}
                        >
                          償還積欠
                        </button>
                      ) : null}
                      <button
                        type="button"
                        disabled={fullPay <= 0}
                        onClick={() => {
                          const check = validateRepayLoan(state, loan.id, fullPay);
                          if (!check.ok) {
                            reject(check.reason);
                            return;
                          }
                          onRepayLoan(loan.id, fullPay);
                          setNotice(fullPay >= debt ? '貸款已清償' : `已還款 ${money(fullPay)}`);
                        }}
                      >
                        {fullPay >= debt ? '一次清償' : `還款 ${money(fullPay)}`}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}

      {tab === 'stocks' ? (
        <div role="tabpanel">
          <p className="panel-muted">
            無買賣價差。跨期才有漲跌，持有期間放棄閒置利息。紅漲、綠跌。走勢只畫到本期。
          </p>
          <ul className="bank-list">
            {STOCK_LIST.map((stock) => {
              const quote = quoteStockMove(stock.symbol, state.financeTick);
              const series = quoteStockSeries(stock.symbol, state.financeTick);
              const holding = book.stocks.find((item) => item.symbol === stock.symbol);
              const shares = shareAmounts[stock.symbol];
              const tone =
                quote.delta > 0 ? 'quote-rise' : quote.delta < 0 ? 'quote-fall' : 'quote-flat';
              const low = Math.min(...series);
              const high = Math.max(...series);
              return (
                <li key={stock.symbol} className="bank-card">
                  <strong>
                    {stock.nameZh} <span className="bank-code">{stock.symbol}</span>
                  </strong>
                  <div className="stock-quote-row">
                    <p className={tone}>
                      {money(quote.price)} {quote.delta > 0 ? '▲' : quote.delta < 0 ? '▼' : '–'}{' '}
                      {Math.abs(quote.delta)}
                    </p>
                    <StockSparkline
                      prices={series}
                      tone={tone}
                      label={`${stock.nameZh}近 ${series.length} 期走勢，最低 ${money(low)}，最高 ${money(high)}，現價 ${money(quote.price)}`}
                    />
                  </div>
                  <p className="panel-muted">
                    近 {series.length} 期 {money(low)}–{money(high)}
                    {series.length < 2 ? ' · 日結後才會走出第二點' : ''}
                  </p>
                  <p className="panel-muted">
                    {stock.blurb}
                    {holding
                      ? ` 持股 ${holding.shares} · 成本 ${money(holding.avgCost)}`
                      : ' 未持有'}
                  </p>
                  <p className="panel-muted">
                    本期機會成本{' '}
                    {money(
                      interestOn(
                        (holding?.shares ?? 0) * quote.price,
                        DEFAULT_BANK_CONFIG.idleInterestBps,
                      ),
                    )}
                    （持股市值若改放閒置現金）。這筆 {shares} 股另計{' '}
                    {money(interestOn(shares * quote.price, DEFAULT_BANK_CONFIG.idleInterestBps))}。
                  </p>
                  <label className="bid-field">
                    <span>股數</span>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={shares}
                      onChange={(event) =>
                        setShareAmounts((current) => ({
                          ...current,
                          [stock.symbol]: Number(event.target.value),
                        }))
                      }
                    />
                  </label>
                  <div className="panel-actions">
                    <button
                      type="button"
                      onClick={() => {
                        const check = validateBuyStock(state, stock.symbol, shares);
                        if (!check.ok) {
                          reject(check.reason);
                          return;
                        }
                        onBuyStock(stock.symbol, shares);
                        setNotice(`買入 ${stock.nameZh} ${shares} 股`);
                      }}
                    >
                      買入
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => {
                        const check = validateSellStock(state, stock.symbol, shares);
                        if (!check.ok) {
                          reject(check.reason);
                          return;
                        }
                        onSellStock(stock.symbol, shares);
                        setNotice(`賣出 ${stock.nameZh} ${shares} 股`);
                      }}
                    >
                      賣出
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {tab === 'wholesale' ? (
        <div role="tabpanel">
          <p className="panel-muted">
            以手為單位。賣價比買價低 4%，同一週轉手一定虧損。煤炭與銅可以一手提領成 1
            單位產線原料，市價高於自己開採。
          </p>
          <ul className="bank-list">
            {COMMODITY_LIST.map((commodity) => {
              const ask = quoteCommodityAsk(commodity.id, state.financeTick);
              const bid = quoteCommodityBid(ask, DEFAULT_BANK_CONFIG.commoditySpreadBps);
              const holding = book.commodities.find((item) => item.commodityId === commodity.id);
              const lots = lotAmounts[commodity.id];
              const lotsHeld = holding ? Math.floor(holding.units / commodity.lotSize) : 0;
              return (
                <li key={commodity.id} className="bank-card">
                  <strong>{commodity.nameZh}</strong>
                  <p>
                    買 {money(ask)} · 賣 {money(bid)}
                    <span className="panel-muted">
                      {' '}
                      /{commodity.unit} · 1 手 = {commodity.lotSize}
                      {commodity.unit}
                    </span>
                  </p>
                  <p className="panel-muted">
                    庫存 {lotsHeld} 手{holding ? `（${holding.units}${commodity.unit}）` : ''}
                  </p>
                  <label className="bid-field">
                    <span>手數</span>
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={lots}
                      onChange={(event) =>
                        setLotAmounts((current) => ({
                          ...current,
                          [commodity.id]: Number(event.target.value),
                        }))
                      }
                    />
                  </label>
                  <div className="panel-actions">
                    <button
                      type="button"
                      onClick={() => {
                        const check = validateBuyCommodity(state, commodity.id, lots);
                        if (!check.ok) {
                          reject(check.reason);
                          return;
                        }
                        onBuyCommodity(commodity.id, lots);
                        setNotice(`買入 ${commodity.nameZh} ${lots} 手`);
                      }}
                    >
                      買入
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => {
                        const check = validateSellCommodity(state, commodity.id, lots);
                        if (!check.ok) {
                          reject(check.reason);
                          return;
                        }
                        onSellCommodity(commodity.id, lots);
                        setNotice(`賣出 ${commodity.nameZh} ${lots} 手`);
                      }}
                    >
                      賣出
                    </button>
                    {COMMODITY_INTAKE[commodity.id] ? (
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => {
                          const check = validateWithdrawCommodity(state, commodity.id, lots);
                          if (!check.ok) {
                            reject(check.reason);
                            return;
                          }
                          onWithdrawCommodity(commodity.id, lots);
                          setNotice(`提領 ${commodity.nameZh} ${lots} 手進產線庫存`);
                        }}
                      >
                        提領入庫
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <div className="bank-day-preview">
        <h3>下次日結</h3>
        <ul className="bank-breakdown">
          <li>土地稅 −{money(preview.taxPaid)}</li>
          <li>閒置利息 {signedMoney(preview.settlement.idleInterest)}</li>
          <li>
            工廠維護 −
            {money(
              Math.min(
                preview.cashAfter,
                Object.values(state.sites).filter((site) => site.phase === 'complete').length *
                  MAINTENANCE_PER_FACTORY,
              ),
            )}
          </li>
        </ul>
        <p className="panel-hint">標題列倒數歸零時自動結算，稅、利息與維護只走這一次。</p>
      </div>
      {notice ? <p className="bank-notice">{notice}</p> : null}
    </section>
  );
}
