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
        {ITEM_LIST.map((def) => {
          const qty = getItemQty(stock, def.id);
          return (
            <li key={def.id} className={qty === 0 ? 'dim' : ''}>
              <span>{def.nameZh}</span>
              <span className="qty">{qty}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
