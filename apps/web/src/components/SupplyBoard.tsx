import {
  listSiteSupply,
  parcelIdFromCoords,
  quoteRestock,
  type ParcelId,
  type WorldState,
} from '@industry-dynasty/sim';
import './SupplyBoard.css';

export interface SupplyBoardProps {
  state: WorldState;
  selectedParcelId: ParcelId | null;
  onSelect: (parcelId: ParcelId) => void;
  onRestock: (parcelId: ParcelId) => void;
}

export function SupplyBoard({ state, selectedParcelId, onSelect, onRestock }: SupplyBoardProps) {
  const sites = listSiteSupply(state);
  const hauling = sites.reduce((sum, site) => sum + site.inbound.length, 0);

  return (
    <section className="sys-panel supply-board" aria-label="供應鏈">
      <header className="sys-panel-head">
        <span className="sys-panel-tag">SUP</span>
        <h2>供應鏈</h2>
        <span className="supply-count">{hauling > 0 ? `${hauling} 車在途` : '料倉自選'}</span>
      </header>
      <p className="sys-muted">
        公司庫仍直接供料。補一輪才把差額送進料倉，運費在出車時入帳。
      </p>
      {sites.length === 0 ? (
        <p className="supply-empty">完工的廠會列在這裡。</p>
      ) : (
        <ul className="supply-sites">
          {sites.map((site) => {
            const parcelId = parcelIdFromCoords(site.x, site.y);
            const quote = quoteRestock(state, parcelId);
            const selected = selectedParcelId?.value === site.parcelKey;
            return (
              <li key={site.parcelKey} className={selected ? 'is-selected' : ''}>
                <button type="button" className="supply-site" onClick={() => onSelect(parcelId)}>
                  <span className="supply-site-title">
                    {site.factoryNameZh}
                    <span>
                      {site.x},{site.y}
                    </span>
                  </span>
                  <span className={`supply-recipe${site.waiting ? ' is-short' : ''}`}>
                    {site.recipeNameZh ?? '尚未排產'}
                    {site.waiting ? ' · 待料' : ''}
                  </span>
                </button>
                <p className="supply-line">
                  料倉 {site.bin.length === 0 ? '空' : site.bin.map((item) => `${item.nameZh} ${item.quantity}`).join('、')}
                </p>
                {site.inbound.length > 0 ? (
                  <p className="supply-line inbound">
                    在途{' '}
                    {site.inbound
                      .map((item) => `${item.nameZh} ${item.quantity} · ${item.ticksLeft} 刻`)
                      .join('、')}
                  </p>
                ) : null}
                {site.inputs.length > 0 ? (
                  <ul className="supply-inputs">
                    {site.inputs.map((input) => (
                      <li key={input.itemId} className={input.shortfall > 0 ? 'is-short' : ''}>
                        <span>{input.nameZh}</span>
                        <span>
                          每輪 {input.perCycle} · 倉 {input.inBin} · 途 {input.inbound} · 公司 {input.inCompany}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <button
                  type="button"
                  className="sys-btn secondary supply-restock"
                  disabled={!quote.ok}
                  onClick={() => onRestock(parcelId)}
                >
                  {quote.ok ? `補一輪 · 運費 $${quote.freight.toLocaleString()}` : quote.reason}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
