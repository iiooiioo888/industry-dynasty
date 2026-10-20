import { getItemQty, getPlayerInventory, ITEM_LIST, type WorldState } from '@industry-dynasty/sim';
import './InventoryPanel.css';

export interface InventoryPanelProps {
  state: WorldState;
}

export function InventoryPanel({ state }: InventoryPanelProps) {
  const stock = getPlayerInventory(state, state.localPlayerId);

  return (
    <section className="sys-panel inventory-panel">
      <header className="sys-panel-head">
        <span className="sys-panel-tag">INV</span>
        <h2>庫存</h2>
      </header>
      <ul className="inventory-list">
        {ITEM_LIST.filter((def) => getItemQty(stock, def.id) > 0).map((def) => (
          <li key={def.id}>
            <span>{def.nameZh}</span>
            <span className="qty">{getItemQty(stock, def.id)}</span>
          </li>
        ))}
      </ul>
      {ITEM_LIST.every((def) => getItemQty(stock, def.id) === 0) ? <p className="sys-muted">空</p> : null}
    </section>
  );
}
