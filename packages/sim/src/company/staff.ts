import { FACTORY_TYPES, type SiteKind } from '../buildings/catalog.js';
import type { ParcelId } from '../types/map.js';
import type { WorldState } from '../world/state.js';

export type StaffRole = 'foreman' | 'researcher' | 'shopkeeper';

export interface StaffCandidate {
  readonly id: string;
  readonly nameZh: string;
  readonly role: StaffRole;
  readonly wagePerDay: number;
  readonly skill: number;
}

export interface HiredStaff {
  readonly id: string;
  readonly candidateId: string;
  readonly nameZh: string;
  readonly role: StaffRole;
  readonly wagePerDay: number;
  readonly skill: number;
  readonly assignedParcelId: string | null;
}

export const STAFF_ROSTER: readonly StaffCandidate[] = [
  { id: 'lin-foreman', nameZh: '林班長', role: 'foreman', wagePerDay: 420, skill: 3 },
  { id: 'kao-foreman', nameZh: '高班長', role: 'foreman', wagePerDay: 680, skill: 5 },
  { id: 'chou-lab', nameZh: '周研發', role: 'researcher', wagePerDay: 540, skill: 3 },
  { id: 'pei-lab', nameZh: '裴研發', role: 'researcher', wagePerDay: 820, skill: 5 },
  { id: 'shan-shop', nameZh: '單店長', role: 'shopkeeper', wagePerDay: 460, skill: 3 },
  { id: 'mo-shop', nameZh: '莫店長', role: 'shopkeeper', wagePerDay: 700, skill: 5 },
];

const ROLE_KIND: Record<StaffRole, SiteKind> = {
  foreman: 'works',
  researcher: 'lab',
  shopkeeper: 'store',
};

export function listStaff(state: WorldState): readonly HiredStaff[] {
  return state.staff ?? [];
}

export function roleKind(role: StaffRole): SiteKind {
  return ROLE_KIND[role];
}

/** 技能 5 每刻多推進一格；技能 3 隔刻多推進一格。沒有班長則不加速。 */
export function extraProductionTicks(skill: number, productionTick: number): number {
  if (skill >= 5) {
    return 1;
  }
  if (skill >= 3 && productionTick % 2 === 0) {
    return 1;
  }
  return 0;
}

export function foremanSkillAt(state: WorldState, parcelKey: string): number {
  const staff = listStaff(state).find(
    (person) => person.role === 'foreman' && person.assignedParcelId === parcelKey,
  );
  return staff?.skill ?? 0;
}

export function shopkeeperSkillAt(state: WorldState, parcelKey: string): number {
  const staff = listStaff(state).find(
    (person) => person.role === 'shopkeeper' && person.assignedParcelId === parcelKey,
  );
  return staff?.skill ?? 0;
}

export function researcherPointGain(state: WorldState): number {
  const playerId = state.localPlayerId;
  let gain = 0;
  for (const person of listStaff(state)) {
    if (person.role !== 'researcher' || !person.assignedParcelId) {
      continue;
    }
    const site = state.sites[person.assignedParcelId];
    if (
      !site ||
      site.phase !== 'complete' ||
      site.ownerId !== playerId ||
      FACTORY_TYPES[site.factoryTypeId].kind !== 'lab'
    ) {
      continue;
    }
    gain += person.skill;
  }
  return gain;
}

export function dailyWage(state: WorldState): number {
  return listStaff(state).reduce((sum, person) => sum + person.wagePerDay, 0);
}

export function hireStaff(state: WorldState, candidateId: string): WorldState {
  const candidate = STAFF_ROSTER.find((person) => person.id === candidateId);
  if (!candidate || listStaff(state).some((person) => person.candidateId === candidateId)) {
    return state;
  }
  const hired: HiredStaff = {
    id: `staff-${candidate.id}`,
    candidateId: candidate.id,
    nameZh: candidate.nameZh,
    role: candidate.role,
    wagePerDay: candidate.wagePerDay,
    skill: candidate.skill,
    assignedParcelId: null,
  };
  return { ...state, staff: [...listStaff(state), hired] };
}

export function dismissStaff(state: WorldState, staffId: string): WorldState {
  if (!listStaff(state).some((person) => person.id === staffId)) {
    return state;
  }
  return { ...state, staff: listStaff(state).filter((person) => person.id !== staffId) };
}

export function assignStaff(
  state: WorldState,
  staffId: string,
  parcelId: ParcelId | null,
): WorldState {
  const staff = listStaff(state);
  const person = staff.find((entry) => entry.id === staffId);
  if (!person) {
    return state;
  }
  if (!parcelId) {
    return {
      ...state,
      staff: staff.map((entry) =>
        entry.id === staffId ? { ...entry, assignedParcelId: null } : entry,
      ),
    };
  }
  const parcel = state.map.parcels.find((entry) => entry.id.value === parcelId.value);
  const site = state.sites[parcelId.value];
  const playerId = state.localPlayerId;
  if (!parcel || parcel.ownerId !== playerId || !site || site.phase !== 'complete') {
    return state;
  }
  if (FACTORY_TYPES[site.factoryTypeId].kind !== roleKind(person.role)) {
    return state;
  }
  return {
    ...state,
    staff: staff.map((entry) => {
      if (entry.id === staffId) {
        return { ...entry, assignedParcelId: parcelId.value };
      }
      if (entry.assignedParcelId === parcelId.value) {
        return { ...entry, assignedParcelId: null };
      }
      return entry;
    }),
  };
}

export function releaseStaffAt(state: WorldState, parcelKey: string): WorldState {
  if (!listStaff(state).some((person) => person.assignedParcelId === parcelKey)) {
    return state;
  }
  return {
    ...state,
    staff: listStaff(state).map((person) =>
      person.assignedParcelId === parcelKey ? { ...person, assignedParcelId: null } : person,
    ),
  };
}
