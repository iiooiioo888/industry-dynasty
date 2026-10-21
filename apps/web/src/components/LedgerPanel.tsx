import { formatBps, quoteDesk, quoteRates, type WorldState } from '@industry-dynasty/sim';
import './LedgerPanel.css';

function money(amount: number): string {
  return `$${amount.toLocaleString()}`;
}

export function LedgerPanel({ state }: { state: WorldState }) {
  const desk = quoteDesk(state);
  const rates = quoteRates(state.financeTick);
  const plan = desk.cashPlan;
  const bank = desk.bank;
  const creditPct =
    bank.creditLimit > 0 ? Math.min(100, Math.round((bank.creditUsed / bank.creditLimit) * 100)) : 0;

  return (
    <section className="sys-panel ledger-panel page-span">
      <header className="sys-panel-head">
        <span className="sys-panel-tag">DATA</span>
        <h2>數據</h2>
      </header>
      <dl className="ledger-grid">
        <div>
          <dt>政策</dt>
          <dd>{formatBps(rates.policyAnnualBps)}</dd>
        </div>
        <div>
          <dt>通膨</dt>
          <dd>{formatBps(rates.inflationAnnualBps)}</dd>
        </div>
        <div>
          <dt>實質</dt>
          <dd>{formatBps(rates.realAnnualBps)}</dd>
        </div>
        <div>
          <dt>淨值</dt>
          <dd>{money(bank.netWorth)}</dd>
        </div>
        <div>
          <dt>日支出</dt>
          <dd>{money(plan.burn)}</dd>
        </div>
        <div>
          <dt>可撐</dt>
          <dd>{plan.runwayDays === null ? '—' : `${plan.runwayDays} 日`}</dd>
        </div>
        <div>
          <dt>市佔</dt>
          <dd>{Math.round(desk.share * 100)}%</dd>
        </div>
        <div>
          <dt>消費品營收</dt>
          <dd>{money(desk.consumerRevenue)}</dd>
        </div>
        <div>
          <dt>架上</dt>
          <dd>
            {desk.shelfUnits} · {money(bank.shelfValue)}
          </dd>
        </div>
        <div>
          <dt>在途合約</dt>
          <dd>
            {desk.shippingContracts} · {money(desk.contractFace)}
          </dd>
        </div>
        <div>
          <dt>未接合約</dt>
          <dd>{desk.openContracts}</dd>
        </div>
        <div>
          <dt>授信</dt>
          <dd>
            {money(bank.creditUsed)} / {money(bank.creditLimit)}
          </dd>
        </div>
      </dl>
      <div className="credit-track" aria-hidden="true">
        <span style={{ width: `${creditPct}%` }} />
      </div>
      <dl className="ledger-grid ledger-burn">
        <div>
          <dt>土地稅</dt>
          <dd>{money(plan.landTax)}</dd>
        </div>
        <div>
          <dt>薪資</dt>
          <dd>{money(plan.wages)}</dd>
        </div>
        <div>
          <dt>店與研發</dt>
          <dd>{money(plan.upkeep)}</dd>
        </div>
        <div>
          <dt>廠房</dt>
          <dd>{money(plan.factoryMaintenance)}</dd>
        </div>
        <div>
          <dt>下期貸款</dt>
          <dd>{money(plan.loanDue)}</dd>
        </div>
        <div>
          <dt>庫存</dt>
          <dd>{money(bank.inventoryValue)}</dd>
        </div>
      </dl>
      <table className="ledger-cities">
        <thead>
          <tr>
            <th>城市</th>
            <th>對手</th>
            <th>廣告</th>
            <th>合約</th>
          </tr>
        </thead>
        <tbody>
          {desk.cities.map((city) => (
            <tr key={city.cityId}>
              <td>{city.name}</td>
              <td>{city.rivalName ? `${Math.round(city.rivalPresence * 100)}%` : '—'}</td>
              <td>{city.campaignDays > 0 ? `${city.campaignDays} 日` : '—'}</td>
              <td>{money(city.contractValue)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
