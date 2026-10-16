import type { Parcel, ParcelId } from '../types/map.js';
import type { FactoryTypeDef, FactoryTypeId } from './catalog.js';
import { FACTORY_TYPES } from './catalog.js';
import type { ConstructingSite, ParcelSite } from './site.js';
import type { Player } from '../world/state.js';

export interface StartBuildResult {
  ok: boolean;
  reason?: string;
  parcel?: Parcel;
  player?: Player;
  site?: ConstructingSite;
}

export function canBuildOnParcel(
  parcel: Parcel,
  ownerId: string,
  site: ParcelSite | undefined,
): boolean {
  if (parcel.role !== 'land') {
    return false;
  }
  if (parcel.ownerId !== ownerId) {
    return false;
  }
  if (parcel.state !== 'owned') {
    return false;
  }
  if (site) {
    return false;
  }
  return true;
}

export function validateStartBuild(
  parcel: Parcel,
  player: Player,
  factoryType: FactoryTypeDef,
  site: ParcelSite | undefined,
): StartBuildResult {
  if (!canBuildOnParcel(parcel, player.id, site)) {
    return { ok: false, reason: '此土地無法建造' };
  }
  if (player.cash < factoryType.buildCost) {
    return { ok: false, reason: '現金不足以支付建造費用' };
  }
  return { ok: true };
}

export function applyStartBuild(
  parcel: Parcel,
  player: Player,
  factoryTypeId: FactoryTypeId,
  existingSite: ParcelSite | undefined,
): StartBuildResult {
  const factoryType = FACTORY_TYPES[factoryTypeId];
  const validation = validateStartBuild(parcel, player, factoryType, existingSite);
  if (!validation.ok) {
    return validation;
  }

  const site: ConstructingSite = {
    phase: 'constructing',
    factoryTypeId,
    ownerId: player.id,
    progressTicks: 0,
    totalTicks: factoryType.buildTimeTicks,
  };

  return {
    ok: true,
    parcel: { ...parcel, state: 'building' },
    player: { ...player, cash: player.cash - factoryType.buildCost },
    site,
  };
}

export interface BuildTickOutcome {
  site: ParcelSite;
  parcel: Parcel;
  completed: boolean;
}

export function advanceConstruction(
  parcel: Parcel,
  site: ConstructingSite,
  buildingId: string,
): BuildTickOutcome {
  const nextProgress = site.progressTicks + 1;
  if (nextProgress < site.totalTicks) {
    return {
      site: { ...site, progressTicks: nextProgress },
      parcel,
      completed: false,
    };
  }

  return {
    site: {
      phase: 'complete',
      factoryTypeId: site.factoryTypeId,
      ownerId: site.ownerId,
      buildingId,
    },
    parcel: { ...parcel, state: 'building-ready' },
    completed: true,
  };
}

export function applyCancelBuild(
  parcel: Parcel,
  player: Player,
  site: ConstructingSite,
): { parcel: Parcel; player: Player } {
  const factoryType = FACTORY_TYPES[site.factoryTypeId];
  const refund = Math.floor(factoryType.buildCost * 0.5);
  return {
    parcel: { ...parcel, state: 'owned' },
    player: { ...player, cash: player.cash + refund },
  };
}

export function applyDemolish(parcel: Parcel): Parcel {
  return { ...parcel, state: 'owned' };
}

export function getSiteForParcel(
  sites: Readonly<Record<string, ParcelSite>>,
  parcelId: ParcelId,
): ParcelSite | undefined {
  return sites[parcelId.value];
}
