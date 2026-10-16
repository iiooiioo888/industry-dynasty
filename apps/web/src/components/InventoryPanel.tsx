import { getItemQty, getPlayerInventory, ITEMS, type ItemId, type WorldState } from '@industry-dynasty/sim';
import './InventoryPanel.css';

const DISPLAY_ITEMS: ItemId[] = ['raw-ore', 'resin', 'basic-part', 'alloy-plate'];

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
        {DISPLAY_ITEMS.map((id) => {
          const def = ITEMS[id];
          const qty = getItemQty(stock, id);
          return (
            <li key={id} className={qty === 0 ? 'dim' : ''}>
              <span>{def.nameZh}</span>
              <span className="qty">{qty}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
