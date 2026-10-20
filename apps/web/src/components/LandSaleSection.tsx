import { landSaleBoard, type ParcelId, type WorldState } from '@industry-dynasty/sim';
import './LandSaleSection.css';

export interface LandSaleSectionProps {
  state: WorldState;
  onSellLand: (parcelId: ParcelId) => void;
}

/**
 * 土地轉手。
 *
 * `SELL_LAND` 早就實作了（估價、增值係數、轉手折價，還刻意排除礦脈儲量
 * 避免「買地→等增值→套利」），但一直沒有入口 —— 買了地就只能放到結束。
 */
export function LandSaleSection({ state, onSellLand }: LandSaleSectionProps) {
  const board = landSaleBoard(state);
  if (board.rows.length === 0) {
    return null;
  }

  return (
    <section className="sys-panel land-sale">
      <header className="sys-panel-head">
        <span className="sys-panel-tag">LND</span>
        <h2>
          土地轉手 {board.sellable}/{board.rows.length} 塊可賣
          {board.totalProceeds > 0 ? ` · 可入帳 $${board.totalProceeds.toLocaleString()}` : ''}
        </h2>
      </header>
      <ul>
        {board.rows.map((row) => (
          <li key={row.parcelKey} className={row.canSell ? '' : 'is-blocked'}>
            <span className="ls-coord">
              ({row.x},{row.y})
            </span>
            <span className="ls-appraise">估價 ${row.appraisedValue.toLocaleString()}</span>
            <span className="ls-proceeds">入帳 ${row.proceeds.toLocaleString()}</span>
            <span className="ls-advice">{row.advice}</span>
            <button
              type="button"
              disabled={!row.canSell}
              onClick={() => onSellLand({ value: row.parcelKey } as ParcelId)}
              title={row.canSell ? '把這塊地賣掉換現金' : (row.blockedReason ?? '')}
            >
              賣地
            </button>
          </li>
        ))}
      </ul>
      <p className="panel-hint">
        轉手價是估價的七成，而且**不含礦脈儲量** —— 靠囤地等增值並不划算， 先拆掉地上建築才能賣。
      </p>
    </section>
  );
}
