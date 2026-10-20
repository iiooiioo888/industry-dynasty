import {
  ITEMS,
  NPCS,
  getItemQty,
  getPlayerInventory,
  listNpcDeals,
  type WorldState,
} from '@industry-dynasty/sim';
import './NpcPanel.css';

export function NpcPanel({
  state,
  onAccept,
}: {
  state: WorldState;
  onAccept: (dealId: string) => void;
}) {
  const stock = getPlayerInventory(state, state.localPlayerId);
  const cash = state.players[state.localPlayerId]?.cash ?? 0;
  const deals = listNpcDeals(state);

  return (
    <section className="sys-panel npc-panel page-span">
      <header className="sys-panel-head">
        <span className="sys-panel-tag">NPC</span>
        <h2>人物</h2>
      </header>
      <table className="npc-table">
        <thead>
          <tr>
            <th>人</th>
            <th>今日</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {NPCS.map((npc) => {
            const deal = deals.find((item) => item.npcId === npc.id);
            const item = deal ? ITEMS[deal.itemId] : undefined;
            const affordable = deal
              ? deal.side === 'npc-sells'
                ? cash >= deal.unitPrice * deal.quantity
                : getItemQty(stock, deal.itemId) >= deal.quantity
              : false;
            return (
              <tr key={npc.id}>
                <td>
                  {npc.nameZh}
                  <small>
                    {npc.roleZh} · {npc.placeZh}
                  </small>
                </td>
                <td>
                  {deal && item
                    ? `${deal.side === 'npc-sells' ? '賣' : '收'} ${item.nameZh} × ${deal.quantity} · $${deal.unitPrice.toLocaleString()}`
                    : '—'}
                </td>
                <td>
                  {deal ? (
                    <button type="button" disabled={!affordable} onClick={() => onAccept(deal.id)}>
                      成交
                    </button>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
