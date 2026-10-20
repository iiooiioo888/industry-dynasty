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

function restockLabel(reason: string): string {
  if (reason.includes('排產')) return '先排產';
  if (reason.includes('礦脈')) return '吃礦脈';
  if (reason.includes('在路上') || reason.includes('在倉')) return '料已齊';
  if (reason.includes('運費')) return '運費不足';
  if (reason.includes('庫存')) return '料不夠';
  return '不能補';
}

export function SupplyBoard({ state, selectedParcelId, onSelect, onRestock }: SupplyBoardProps) {
  const sites = listSiteSupply(state);
  const hauling = sites.reduce((sum, site) => sum + site.inbound.length, 0);

  return (
    <section className="sys-panel supply-board" aria-label="供應鏈">
      <header className="sys-panel-head">
        <span className="sys-panel-tag">SUP</span>
        <h2>供應鏈</h2>
        <span className="supply-count">{hauling > 0 ? `${hauling} 車` : ''}</span>
      </header>
      {sites.length === 0 ? (
        <p className="supply-empty">尚無完工廠</p>
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
                    {site.recipeNameZh ?? '未排產'}
                    {site.waiting ? ' · 待料' : ''}
                  </span>
                </button>
                <p className="supply-line">
                  {site.bin.length === 0
                    ? '倉空'
                    : site.bin.map((item) => `${item.nameZh} ${item.quantity}`).join(' ')}
                  {site.inbound.length > 0
                    ? ` · 途 ${site.inbound.map((item) => `${item.nameZh}${item.quantity}`).join(' ')}`
                    : ''}
                </p>
                {site.inputs.some((input) => input.shortfall > 0) ? (
                  <p className="supply-line is-short">
                    缺{' '}
                    {site.inputs
                      .filter((input) => input.shortfall > 0)
                      .map((input) => `${input.nameZh} ${input.shortfall}`)
                      .join(' ')}
                  </p>
                ) : null}
                <button
                  type="button"
                  className="sys-btn secondary supply-restock"
                  disabled={!quote.ok}
                  onClick={() => onRestock(parcelId)}
                >
                  {quote.ok ? `補 $${quote.freight.toLocaleString()}` : restockLabel(quote.reason)}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
