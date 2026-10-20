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
  getItemQty,
  getPlayerInventory,
  getProductionLine,
  getSite,
  hasRecipeInputs,
  listCityOrders,
  listStaff,
  readResearch,
  recipeBlockReason,
  type FloorStation,
  type MachineGradeId,
  type ParcelId,
  type RecipeId,
  type WorldState,
} from '@industry-dynasty/sim';
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
      />
    );
  }

  if (station.role === 'machine') {
    const line = getProductionLine(state, parcelId);
    const recipe = line && line.status !== 'stopped' ? RECIPES[line.recipeId] : undefined;
    if (!line || !recipe || recipe.stage === 'extract') {
      return <p className="floor-detail">開採不用裝機。加工產線開工後，才能在這裡換機台。</p>;
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
        {crew.length === 0 ? <p className="floor-detail">這個席位還沒有人。</p> : null}
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
        <p className="floor-detail">港區要走路才入帳。城市供貨當場交貨，單價是貨值的九成，不收運費，也不改港區牌價。</p>
        <ul className="floor-actions">
          {orders.map((order) => {
            const have = getItemQty(stock, order.itemId);
            const room = order.quantity - order.filled;
            const qty = Math.min(room, have);
            return (
              <li key={order.id}>
                <span>
                  {order.cityName}要 {order.nameZh} {room} 件 · ${order.unitPay.toLocaleString()}/件 · 庫存 {have}
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
                港區收 {ITEMS[offer.itemId].nameZh} · ${offer.unitPrice.toLocaleString()}/件 · 庫存{' '}
                {getItemQty(stock, offer.itemId)}
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
        <p className="floor-detail">研發點 {research.points}。指派研發員後，模擬時間會累點。</p>
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
        <p className="floor-detail">品牌 {brandOf(state)}。${AD_POINT_COST.toLocaleString()} 換 1 點，只拉高門市量，日結消退。</p>
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
}: {
  state: WorldState;
  parcelId: ParcelId;
  cash: number;
  stock: ReturnType<typeof getPlayerInventory>;
  mode: 'intake' | 'work';
  onStart: (recipeId: RecipeId, machineGradeId?: MachineGradeId) => void;
  onStop: () => void;
}) {
  const parcel = state.map.parcels.find((entry) => entry.id.value === parcelId.value);
  const site = getSite(state, parcelId);
  const line = getProductionLine(state, parcelId);
  const recipe = line && line.status !== 'stopped' ? RECIPES[line.recipeId] : undefined;
  if (!parcel || !site || site.phase !== 'complete') {
    return null;
  }
  if (recipe && line) {
    const missing = recipe.inputs.filter((input) => getItemQty(stock, input.itemId) < input.quantity);
    return (
      <div className="floor-desk">
        <p className="floor-detail">
          {recipe.nameZh} · {line.progressTicks}/{line.cycleTicks}
          {line.status === 'waiting_inputs' ? ' · 待料' : ''}
        </p>
        {mode === 'intake' ? (
          <ul className="floor-actions">
            {recipe.inputs.length === 0 ? (
              <li>這條線直接吃礦脈，不進原料。</li>
            ) : (
              recipe.inputs.map((input) => (
                <li key={input.itemId}>
                  {ITEMS[input.itemId].nameZh} 需要 {input.quantity} · 庫存 {getItemQty(stock, input.itemId)}
                  {missing.some((gap) => gap.itemId === input.itemId) ? ' · 不足' : ''}
                </li>
              ))
            )}
          </ul>
        ) : (
          <button type="button" onClick={onStop}>
            停止這條產線
          </button>
        )}
      </div>
    );
  }

  if (mode === 'intake') {
    return <p className="floor-detail">還沒排產。到作業區選配方，原料會從這裡進。</p>;
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
        <p className="floor-detail">這座廠現在沒有可開工的配方。</p>
      ) : (
        <ul className="floor-actions">
          {options.map((entry) => {
            const needsMachine = entry.stage !== 'extract';
            const blocked = needsMachine && cash < machine.installCost;
            const ready = hasRecipeInputs(stock, entry.inputs);
            return (
              <li key={entry.id}>
                <span>
                  {entry.nameZh}
                  {needsMachine ? ` · 附${machine.nameZh}` : ' · 不裝機'}
                  {ready ? '' : ' · 原料不足'}
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
