import { advanceConstruction } from '../buildings/build-logic.js';
import type { Parcel } from '../types/map.js';
import type { WorldState } from './state.js';

let buildingIdCounter = 20_000;

function nextBuildingId(): string {
  buildingIdCounter += 1;
  return `bld-${buildingIdCounter}`;
}

function updateParcelInMap(map: WorldState['map'], parcel: Parcel): WorldState['map'] {
  return {
    ...map,
    parcels: map.parcels.map((item) => (item.id.value === parcel.id.value ? parcel : item)),
  };
}

/** 所有在建工地前進一格。沒有工地時仍前進 buildTick，與既有測試的連點語意相同。 */
export function applyBuildTick(state: WorldState): WorldState {
  let map = state.map;
  const sites = { ...state.sites };

  for (const [key, site] of Object.entries(sites)) {
    if (site.phase !== 'constructing') {
      continue;
    }
    const parcel = map.parcels.find((item) => item.id.value === key);
    if (!parcel) {
      continue;
    }
    const outcome = advanceConstruction(parcel, site, nextBuildingId());
    map = updateParcelInMap(map, outcome.parcel);
    sites[key] =
      outcome.site.phase === 'constructing'
        ? { ...outcome.site, progressAnchorMs: state.clock.simMs }
        : outcome.site;
  }

  return {
    ...state,
    map,
    sites,
    buildTick: state.buildTick + 1,
  };
}
