import {
  AD_POINT_COST,
  FACTORY_TYPES,
  ITEMS,
  MACHINE_GRADES,
  RECIPE_LIST,
  RECIPES,
  RESEARCH_PROJECT_LIST,
  STAFF_ROSTER,
  brandOf,
  downstreamOf,
  getItemQty,
  getPlayerInventory,
  getProductionLine,
  getSite,
  listCityOrders,
  listStaff,
  listSupplyHauls,
  quoteSupplyDispatch,
  readResearch,
  recipeBlockReason,
  siteBin,
  upstreamOf,
  type FloorStation,
  type ItemId,
  type MachineGradeId,
  type ParcelId,
  type PlayerStock,
  type RecipeId,
  type WorldState,
} from '@industry-dynasty/sim';
import { useState } from 'react';
import { MachineCompare } from './MachineCompare';
import { ShelfDesk } from './OperationsPanel';

export interface FloorDeskProps {
  state: WorldState;
  parcelId: ParcelId;
  station: FloorStation;
  onLeave: () => void;
  onStartProduction: (recipeId: RecipeId, machineGradeId?: MachineGradeId) => void;
  onInstallMachine: (machineGradeId: MachineGradeId) => void;
  onStopProduction: () => void;
  onHire: (candidateId: string) => void;
  onDismiss: (staffId: string) => void;
  onAssign: (staffId: string, parcelId: ParcelId | null) => void;
  onUnlock: (projectId: string) => void;
  onSetShelfPrice: (itemId: 'tool-kit' | 'wire-spool' | 'sealant-coat', unitPrice: number) => void;
  onBuyAd: (spend: number) => void;
  onSellToPort: (offerId: string, quantity: number) => void;
  onFillOrder: (orderId: string, quantity: number) => void;
  onDispatchSupply: (itemId: ItemId, quantity: number, fromParcelId?: ParcelId | null) => void;
}

const ROLE_LABEL = {
  foreman: '現場班長',
  researcher: '研發員',
  shopkeeper: '店長',
} as const;

export function FloorDesk({
  state,
  parcelId,
  station,
  onLeave,
  onStartProduction,
  onInstallMachine,
  onStopProduction,
  onHire,
  onDismiss,
  onAssign,
  onUnlock,
  onSetShelfPrice,
  onBuyAd,
  onSellToPort,
  onFillOrder,
  onDispatchSupply,
}: FloorDeskProps) {
  const site = getSite(state, parcelId);
  if (!site || site.phase !== 'complete') {
    return null;
  }
  const kind = FACTORY_TYPES[site.factoryTypeId].kind;
  const player = state.players[state.localPlayerId];
  const cash = player?.cash ?? 0;
  const stock = getPlayerInventory(state, state.localPlayerId);

  if (station.role === 'gate') {
    return (
      <div className="floor-desk">
        <button type="button" className="sys-btn" onClick={onLeave}>
          回到大世界
        </button>
      </div>
    );
  }

  if (station.role === 'intake' || station.role === 'work') {
    return (
      <WorkDesk
        state={state}
        parcelId={parcelId}
        cash={cash}
        stock={stock}
        mode={station.role}
        onStart={onStartProduction}
        onStop={onStopProduction}
        onDispatch={onDispatchSupply}
      />
    );
  }

  if (station.role === 'machine') {
    const line = getProductionLine(state, parcelId);
    const recipe = line && line.status !== 'stopped' ? RECIPES[line.recipeId] : undefined;
    if (!line || !recipe || recipe.stage === 'extract') {
      return <p className="floor-detail">加工線才能換機</p>;
    }
    return (
      <div className="floor-desk">
        <MachineCompare
          compact
          selected={line.machineGradeId}
          cash={cash + (line.machinePaid ?? 0)}
          onSelect={onInstallMachine}
        />
      </div>
    );
  }

  if (station.role === 'crew') {
    const wanted = kind === 'lab' ? 'researcher' : kind === 'store' ? 'shopkeeper' : 'foreman';
    const crew = listStaff(state).filter((person) => person.assignedParcelId === parcelId.value);
    return (
      <div className="floor-desk">
        {crew.length === 0 ? <p className="floor-detail">空席</p> : null}
        <ul className="floor-actions">
          {STAFF_ROSTER.filter((candidate) => candidate.role === wanted).map((candidate) => {
            const hired = listStaff(state).find((person) => person.candidateId === candidate.id);
            const here = hired?.assignedParcelId === parcelId.value;
            return (
              <li key={candidate.id}>
                <span>
                  {candidate.nameZh} · {ROLE_LABEL[candidate.role]} · 技能 {candidate.skill} · 日薪 $
                  {candidate.wagePerDay.toLocaleString()}
                </span>
                {here && hired ? (
                  <button type="button" onClick={() => onDismiss(hired.id)}>
                    解僱
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      if (!hired) {
                        onHire(candidate.id);
                      }
                      onAssign(hired?.id ?? `staff-${candidate.id}`, parcelId);
                    }}
                  >
                    坐這席
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  if (station.role === 'outbound') {
    const offers = state.npcBuyOffers.filter((offer) => getItemQty(stock, offer.itemId) > 0);
    const orders = listCityOrders(state).filter((order) => order.filled < order.quantity);
    return (
      <div className="floor-desk">
        <ul className="floor-actions">
          {orders.map((order) => {
            const have = getItemQty(stock, order.itemId);
            const room = order.quantity - order.filled;
            const qty = Math.min(room, have);
            return (
              <li key={order.id}>
                <span>
                  {order.cityName} {order.nameZh} {room} · ${order.unitPay.toLocaleString()}
                </span>
                <button type="button" disabled={qty <= 0} onClick={() => onFillOrder(order.id, qty)}>
                  交貨
                </button>
              </li>
            );
          })}
          {offers.map((offer) => (
            <li key={offer.id}>
              <span>
                {ITEMS[offer.itemId].nameZh} ${offer.unitPrice.toLocaleString()}
              </span>
              <button type="button" onClick={() => onSellToPort(offer.id, 1)}>
                出 1 件
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (station.role === 'bench') {
    const research = readResearch(state);
    return (
      <div className="floor-desk">
        <p className="floor-detail">點數 {research.points}</p>
        <ul className="floor-actions">
          {RESEARCH_PROJECT_LIST.map((project) => {
            const unlocked = research.unlocked.includes(project.id);
            return (
              <li key={project.id}>
                <span>
                  {project.nameZh} · {project.cost} 點 · {project.blurb}
                </span>
                <button
                  type="button"
                  disabled={unlocked || research.points < project.cost}
                  onClick={() => onUnlock(project.id)}
                >
                  {unlocked ? '已解鎖' : '解鎖'}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  if (station.role === 'shelf') {
    return (
      <div className="floor-desk">
        <ShelfDesk
          state={state}
          parcelId={parcelId}
          onSetPrice={(id, itemId, unitPrice) => {
            if (id.value === parcelId.value) {
              onSetShelfPrice(itemId, unitPrice);
            }
          }}
        />
      </div>
    );
  }

  if (station.role === 'counter') {
    return (
      <div className="floor-desk">
        <p className="floor-detail">品牌 {brandOf(state)} · ${AD_POINT_COST.toLocaleString()}/點</p>
        <button type="button" disabled={cash < AD_POINT_COST} onClick={() => onBuyAd(AD_POINT_COST)}>
          投放 1 點
        </button>
      </div>
    );
  }

  return null;
}

function WorkDesk({
  state,
  parcelId,
  cash,
  stock,
  mode,
  onStart,
  onStop,
  onDispatch,
}: {
  state: WorldState;
  parcelId: ParcelId;
  cash: number;
  stock: PlayerStock;
  mode: 'intake' | 'work';
  onStart: (recipeId: RecipeId, machineGradeId?: MachineGradeId) => void;
  onStop: () => void;
  onDispatch: (itemId: ItemId, quantity: number, fromParcelId?: ParcelId | null) => void;
}) {
  const parcel = state.map.parcels.find((entry) => entry.id.value === parcelId.value);
  const site = getSite(state, parcelId);
  const line = getProductionLine(state, parcelId);
  const recipe = line && line.status !== 'stopped' ? RECIPES[line.recipeId] : undefined;
  if (!parcel || !site || site.phase !== 'complete') {
    return null;
  }
  if (recipe && line) {
    return (
      <div className="floor-desk">
        <p className="floor-detail">
          {recipe.nameZh} · {line.progressTicks}/{line.cycleTicks}
          {line.status === 'waiting_inputs' ? ' · 待料' : ''}
        </p>
        {mode === 'intake' ? (
          <>
            <ul className="floor-actions">
              {recipe.inputs.length === 0 ? (
                <li>吃礦脈</li>
              ) : (
                recipe.inputs.map((input) => (
                  <li key={input.itemId}>
                    {ITEMS[input.itemId].nameZh} {input.quantity} · 庫 {getItemQty(stock, input.itemId)} · 倉{' '}
                    {getItemQty(siteBin(state, parcelId.value), input.itemId)}
                  </li>
                ))
              )}
            </ul>
            <SupplyPanel state={state} parcelId={parcelId} stock={stock} recipeId={recipe.id} onDispatch={onDispatch} />
          </>
        ) : (
          <button type="button" onClick={onStop}>
            停止這條產線
          </button>
        )}
      </div>
    );
  }

  if (mode === 'intake') {
    return (
      <div className="floor-desk">
        <SupplyPanel state={state} parcelId={parcelId} stock={stock} recipeId={null} onDispatch={onDispatch} />
      </div>
    );
  }

  const crafted = state.craftedTotals[state.localPlayerId];
  const options = RECIPE_LIST.filter((entry) => {
    if (!(entry.buildings as readonly string[]).includes(site.factoryTypeId)) {
      return false;
    }
    if (entry.sourceKind && entry.sourceKind !== parcel.resource.kind) {
      return false;
    }
    return !recipeBlockReason({
      recipe: entry,
      resourceKind: parcel.resource.kind,
      factoryTypeId: site.factoryTypeId,
      crafted,
      unlockedResearch: readResearch(state).unlocked,
    });
  }).slice(0, 4);
  const machine = MACHINE_GRADES['balance-press'];

  return (
    <div className="floor-desk">
      {options.length === 0 ? (
        <p className="floor-detail">無可開工配方</p>
      ) : (
        <ul className="floor-actions">
          {options.map((entry) => {
            const needsMachine = entry.stage !== 'extract';
            const blocked = needsMachine && cash < machine.installCost;
            return (
              <li key={entry.id}>
                <span>
                  {entry.nameZh}
                  {needsMachine ? '' : ' · 開採'}
                </span>
                <button
                  type="button"
                  disabled={blocked}
                  onClick={() => onStart(entry.id, needsMachine ? machine.id : undefined)}
                >
                  開工
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function SupplyPanel({
  state,
  parcelId,
  stock,
  recipeId,
  onDispatch,
}: {
  state: WorldState;
  parcelId: ParcelId;
  stock: PlayerStock;
  recipeId: RecipeId | null;
  onDispatch: (itemId: ItemId, quantity: number, fromParcelId?: ParcelId | null) => void;
}) {
  const [itemId, setItemId] = useState<ItemId | ''>('');
  const [qtyText, setQtyText] = useState('1');
  const [fromKey, setFromKey] = useState('');
  const bin = siteBin(state, parcelId.value);
  const held = Object.entries(bin).filter((entry): entry is [ItemId, number] => entry[1] > 0 && entry[0] in ITEMS);
  const incoming = listSupplyHauls(state).filter((haul) => haul.toParcelId === parcelId.value);
  const others = state.map.parcels.filter((parcel) => {
    if (parcel.ownerId !== state.localPlayerId || parcel.id.value === parcelId.value) {
      return false;
    }
    return state.sites[parcel.id.value]?.phase === 'complete';
  });
  const sourceStock = fromKey ? siteBin(state, fromKey) : stock;
  const choices = Object.entries(sourceStock).filter(
    (entry): entry is [ItemId, number] => entry[1] > 0 && entry[0] in ITEMS,
  );
  const chosen = choices.find(([id]) => id === itemId)?.[0] ?? choices[0]?.[0];
  const qty = Number.parseInt(qtyText, 10);
  const fromParcel = fromKey ? (others.find((parcel) => parcel.id.value === fromKey)?.id ?? null) : null;
  const quote =
    chosen !== undefined && Number.isInteger(qty)
      ? quoteSupplyDispatch(state, {
          toParcelId: parcelId,
          itemId: chosen,
          quantity: qty,
          fromParcelId: fromParcel,
        })
      : null;
  const upstream = recipeId ? upstreamOf(recipeId) : [];
  const downstream = recipeId ? downstreamOf(recipeId) : [];

  return (
    <div className="floor-supply-block">
      {recipeId && (upstream.length > 0 || downstream.length > 0) ? (
        <p className="floor-detail">
          {[
            upstream.length > 0 ? `上 ${upstream.map((link) => link.nameZh).join(' ')}` : '',
            downstream.length > 0 ? `下 ${downstream.map((link) => link.nameZh).join(' ')}` : '',
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      ) : null}
      <p className="floor-detail">
        {held.length === 0 ? '倉空' : held.map(([id, have]) => `${ITEMS[id].nameZh} ${have}`).join(' ')}
        {incoming.length > 0
          ? ` · 途 ${incoming.map((haul) => `${ITEMS[haul.itemId].nameZh}${haul.quantity}`).join(' ')}`
          : ''}
      </p>
      <div className="floor-supply">
        <select value={fromKey} onChange={(event) => setFromKey(event.target.value)} aria-label="送料來源">
          <option value="">公司庫</option>
          {others.map((parcel) => (
            <option key={parcel.id.value} value={parcel.id.value}>
              {FACTORY_TYPES[state.sites[parcel.id.value]!.factoryTypeId].nameZh} {parcel.x},{parcel.y}
            </option>
          ))}
        </select>
        <select
          value={chosen ?? ''}
          onChange={(event) => {
            const next = event.target.value;
            if (next in ITEMS) {
              setItemId(next as ItemId);
            }
          }}
          aria-label="送料品項"
          disabled={choices.length === 0}
        >
          {choices.length === 0 ? <option value="">沒有可送的料</option> : null}
          {choices.map(([id, have]) => (
            <option key={id} value={id}>
              {ITEMS[id].nameZh} · {have}
            </option>
          ))}
        </select>
        <input
          aria-label="送料數量"
          inputMode="numeric"
          value={qtyText}
          onChange={(event) => setQtyText(event.target.value.replace(/[^\d]/g, ''))}
        />
        <button
          type="button"
          disabled={!quote?.ok || !chosen}
          onClick={() => {
            if (quote?.ok && chosen) {
              onDispatch(chosen, qty, fromParcel);
            }
          }}
        >
          送進料倉
        </button>
      </div>
      <p className="floor-detail">
        {quote?.ok
          ? `運費 $${quote.freight.toLocaleString()} · ${quote.travelTicks} 刻到達`
          : (quote?.reason ?? '無料')}
      </p>
    </div>
  );
}
