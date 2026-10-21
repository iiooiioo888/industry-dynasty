import {
  FACTORY_TYPES,
  ITEMS,
  MACHINE_GRADES,
  RECIPES,
  RESEARCH_PROJECTS,
  brandOf,
  enterFloorBlock,
  floorPlanFor,
  getProductionLine,
  getSite,
  listStaff,
  readResearch,
  shelfUnitPrice,
  stationAt,
  type FloorStation,
  type ParcelId,
  type WorldState,
} from '@industry-dynasty/sim';
import { useState } from 'react';
import { FloorDesk, type FloorDeskProps } from './FloorDesk';

const SHELF_ITEMS = ['tool-kit', 'wire-spool', 'sealant-coat'] as const;

export interface FactoryFloorProps {
  state: WorldState;
  parcelId: ParcelId;
  commands: Omit<FloorDeskProps, 'state' | 'parcelId' | 'station'>;
}

function stationCopy(
  state: WorldState,
  parcelId: ParcelId,
  station: FloorStation,
): { short: string; detail: string } {
  const site = getSite(state, parcelId);
  const line = getProductionLine(state, parcelId);
  const recipe = line && line.status !== 'stopped' ? RECIPES[line.recipeId] : undefined;
  const crew = listStaff(state).filter((person) => person.assignedParcelId === parcelId.value);
  const machine = line?.machineGradeId ? MACHINE_GRADES[line.machineGradeId] : null;
  const building = site ? FACTORY_TYPES[site.factoryTypeId].nameZh : '建物';

  switch (station.role) {
    case 'gate':
      return { short: '進出', detail: building };
    case 'intake':
      if (!recipe || !line) {
        return { short: '空', detail: '未排產' };
      }
      if (line.status === 'waiting_inputs') {
        return { short: '待料', detail: recipe.nameZh };
      }
      return { short: '備料', detail: recipe.nameZh };
    case 'work':
      if (!recipe || !line || line.status === 'stopped') {
        return { short: '閒置', detail: '未排產' };
      }
      if (line.status === 'waiting_inputs') {
        return { short: '待料', detail: recipe.nameZh };
      }
      if (line.progressTicks < line.travelTicks) {
        return {
          short: '趕路',
          detail: `${recipe.nameZh} ${line.progressTicks}/${line.travelTicks}`,
        };
      }
      return {
        short: '作業',
        detail: `${recipe.nameZh} ${line.progressTicks}/${line.cycleTicks}`,
      };
    case 'machine':
      if (!machine) {
        return { short: '無機', detail: '未裝機' };
      }
      return { short: '已裝', detail: machine.nameZh };
    case 'crew':
      if (crew.length === 0) {
        return { short: '空席', detail: '無人' };
      }
      return {
        short: crew[0]!.nameZh.slice(0, 2),
        detail: crew.map((person) => `${person.nameZh}，技能 ${person.skill}`).join('、'),
      };
    case 'outbound':
      return {
        short: '出貨',
        detail: recipe ? recipe.nameZh : '無成品',
      };
    case 'bench': {
      const research = readResearch(state);
      const unlocked = research.unlocked
        .map((id) => RESEARCH_PROJECTS[id]?.nameZh ?? id)
        .join('、');
      return {
        short: `${research.points}`,
        detail: unlocked ? unlocked : '未解鎖',
      };
    }
    case 'shelf': {
      const prices = SHELF_ITEMS.map(
        (itemId) => `${ITEMS[itemId].nameZh} $${shelfUnitPrice(state, parcelId.value, itemId)}`,
      );
      return { short: '貨架', detail: prices.join(' · ') };
    }
    case 'counter':
      return {
        short: `牌${brandOf(state)}`,
        detail: `品牌 ${brandOf(state)}`,
      };
    default:
      return { short: station.nameZh, detail: station.nameZh };
  }
}

export function FactoryFloor({ state, parcelId, commands }: FactoryFloorProps) {
  const blocked = enterFloorBlock(state, parcelId);
  const site = getSite(state, parcelId);
  const [pickedId, setPickedId] = useState<string | null>(null);

  if (blocked || !site || site.phase !== 'complete') {
    return <p className="floor-blocked">{blocked ?? '這棟建物還不能進入。'}</p>;
  }

  const plan = floorPlanFor(site.factoryTypeId);
  const building = FACTORY_TYPES[site.factoryTypeId];
  const parcel = state.map.parcels.find((entry) => entry.id.value === parcelId.value);
  const picked = pickedId ? plan.stations.find((station) => station.id === pickedId) : plan.stations[0];
  const copy = picked ? stationCopy(state, parcelId, picked) : null;

  return (
    <div className="floor-board" data-floor-kind={plan.kind}>
      <p className="floor-caption">
        {building.nameZh}
        {parcel ? ` · (${parcel.x},${parcel.y})` : ''} · {plan.width}×{plan.height}
      </p>
      <div
        className="floor-grid"
        style={{
          gridTemplateColumns: `repeat(${plan.width}, minmax(4.2rem, 1fr))`,
          gridTemplateRows: `repeat(${plan.height}, minmax(4.2rem, 1fr))`,
        }}
      >
        {Array.from({ length: plan.height }, (_, y) =>
          Array.from({ length: plan.width }, (_, x) => {
            const station = stationAt(plan, x, y);
            const status = station ? stationCopy(state, parcelId, station) : null;
            const selected = station?.id === picked?.id;
            return (
              <button
                key={`${x},${y}`}
                type="button"
                className={`floor-cell${station ? ` role-${station.role}` : ' is-empty'}${selected ? ' selected' : ''}`}
                disabled={!station}
                data-floor-role={station?.role}
                aria-label={station ? `${station.nameZh}，${status?.detail ?? ''}` : '空地'}
                onClick={() => {
                  if (station) {
                    setPickedId(station.id);
                  }
                }}
              >
                {station ? (
                  <>
                    <span className="floor-cell-name">{station.nameZh}</span>
                    <span className="floor-cell-status">{status?.short}</span>
                  </>
                ) : null}
              </button>
            );
          }),
        )}
      </div>
      {picked && copy ? (
        <div className="floor-readout">
          <p className="floor-detail" data-floor-detail="true">
            <strong>{picked.nameZh}</strong>
            {copy.detail}
          </p>
          <FloorDesk state={state} parcelId={parcelId} station={picked} {...commands} />
        </div>
      ) : null}
    </div>
  );
}
