import type { CompleteSite } from '../buildings/site.js';
import type { RivalOutlet } from '../commerce/types.js';
import { npcAtCity, NPCS } from './roster.js';
import type { WorldState } from '../world/state.js';

export const NPC_BLOCK_CAP = 6;
export const NPC_BLOCK_RADIUS = 5;
const STARTING_TREASURY = 120_000;

export function initialNpcTreasury(): Record<string, number> {
  return Object.fromEntries(
    NPCS.filter((npc) => npc.roleZh === '掌櫃').map((npc) => [npc.id, STARTING_TREASURY]),
  );
}

export function expandNpcBlocks(state: WorldState): WorldState {
  const commerce = state.commerce;
  if (!commerce) {
    return state;
  }
  let parcels = state.map.parcels;
  let lots = [...state.auctionLots];
  let sites = { ...state.sites };
  const treasury = { ...(commerce.npcTreasury ?? initialNpcTreasury()) };

  for (const city of state.map.cities) {
    const npc = npcAtCity(city.id);
    if (!npc) {
      continue;
    }
    const owned = parcels.filter((parcel) => parcel.ownerId === npc.id).length;
    if (owned >= NPC_BLOCK_CAP) {
      continue;
    }
    const candidate = parcels
      .filter((parcel) => parcel.role === 'land' && parcel.ownerId === null)
      .map((parcel) => ({
        parcel,
        distance: Math.abs(parcel.x - city.x) + Math.abs(parcel.y - city.y),
      }))
      .filter((item) => item.distance <= NPC_BLOCK_RADIUS)
      .sort((a, b) => a.distance - b.distance || a.parcel.y - b.parcel.y || a.parcel.x - b.parcel.x);
    const pick = candidate.find((item) => {
      const lot = lots.find((entry) => entry.parcelId.value === item.parcel.id.value && entry.status === 'open');
      return lot !== undefined && lot.highBidderId === null && (treasury[npc.id] ?? 0) >= lot.minPrice;
    });
    if (!pick) {
      continue;
    }
    const lot = lots.find((entry) => entry.parcelId.value === pick.parcel.id.value && entry.status === 'open');
    if (!lot) {
      continue;
    }
    treasury[npc.id] = (treasury[npc.id] ?? 0) - lot.minPrice;
    parcels = parcels.map((parcel) =>
      parcel.id.value === pick.parcel.id.value
        ? { ...parcel, ownerId: npc.id, state: 'building-ready' as const }
        : parcel,
    );
    lots = lots.map((entry) =>
      entry.id === lot.id ? { ...entry, status: 'closed' as const, highBid: lot.minPrice, highBidderId: npc.id } : entry,
    );
    const site: CompleteSite = {
      phase: 'complete',
      factoryTypeId: 'storefront',
      ownerId: npc.id,
      buildingId: `npc-${npc.id}-${pick.parcel.id.value}`,
    };
    sites = { ...sites, [pick.parcel.id.value]: site };
  }

  const rivals = commerce.rivals.map((rival) => refreshPresence(rival, parcels));
  return {
    ...state,
    map: { ...state.map, parcels },
    auctionLots: lots,
    sites,
    commerce: { ...commerce, rivals, npcTreasury: treasury },
  };
}

function refreshPresence(rival: RivalOutlet, parcels: WorldState['map']['parcels']): RivalOutlet {
  const npc = npcAtCity(rival.cityId);
  if (!npc) {
    return rival;
  }
  const blocks = parcels.filter((parcel) => parcel.ownerId === npc.id).length;
  return {
    ...rival,
    presence: Math.min(0.72, Math.max(rival.presence, 0.32 + blocks * 0.06)),
  };
}

export function npcBlockCount(state: WorldState, npcId: string): number {
  return state.map.parcels.filter((parcel) => parcel.ownerId === npcId).length;
}
