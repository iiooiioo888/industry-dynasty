import { HOLDING } from '../balance/targets.js';
import { nextLoanDue, summarizeBank, type BankSnapshot } from '../bank/logic.js';
import { FACTORY_TYPES } from '../buildings/catalog.js';
import { marketShareOf, readCommerce, STAFF_TABLE } from '../commerce/logic.js';
import { MACHINE_GRADES } from '../production/machines.js';
import type { WorldState } from '../world/state.js';

export interface CashPlan {
  readonly landTax: number;
  readonly wages: number;
  readonly upkeep: number;
  readonly factoryMaintenance: number;
  readonly loanDue: number;
  readonly burn: number;
  /** 現金夠付幾次日結的固定支出。沒有支出時為 null。 */
  readonly runwayDays: number | null;
}

export interface CityDeskRow {
  readonly cityId: string;
  readonly name: string;
  readonly rivalName: string;
  readonly rivalPresence: number;
  readonly campaignDays: number;
  readonly contractValue: number;
}

export interface DeskSnapshot {
  readonly bank: BankSnapshot;
  readonly cashPlan: CashPlan;
  readonly share: number;
  readonly consumerRevenue: number;
  readonly shelfUnits: number;
  readonly openContracts: number;
  readonly shippingContracts: number;
  readonly contractFace: number;
  readonly staffWage: number;
  readonly cities: readonly CityDeskRow[];
}

export function quoteCashPlan(state: WorldState): CashPlan {
  const playerId = state.localPlayerId;
  const commerce = readCommerce(state);
  const landTax = state.map.parcels.filter((parcel) => parcel.ownerId === playerId).length * HOLDING.landTaxPerParcelPerDay;
  const wages =
    commerce.staff.operators * STAFF_TABLE.operator.dailyWage +
    commerce.staff.clerks * STAFF_TABLE.clerk.dailyWage +
    commerce.staff.researchers * STAFF_TABLE.researcher.dailyWage;
  let upkeep = 0;
  let factories = 0;
  for (const site of Object.values(state.sites)) {
    if (site.phase !== 'complete' || site.ownerId !== playerId) {
      continue;
    }
    const def = FACTORY_TYPES[site.factoryTypeId];
    upkeep += def.dailyUpkeep;
    if (def.role === 'production') {
      factories += 1;
    }
  }
  const machineMaintenance = Object.values(state.productionLines).reduce((sum, line) => {
    if (!line.machineGradeId) {
      return sum;
    }
    return sum + MACHINE_GRADES[line.machineGradeId].maintenancePerDay;
  }, 0);
  const factoryMaintenance = factories * HOLDING.maintenancePerFactoryPerDay + machineMaintenance;
  const book = state.bank[playerId];
  const loanDue = (book?.loans ?? []).reduce((sum, loan) => sum + nextLoanDue(loan).total, 0);
  const burn = landTax + wages + upkeep + factoryMaintenance + loanDue;
  const cash = state.players[playerId]?.cash ?? 0;
  return {
    landTax,
    wages,
    upkeep,
    factoryMaintenance,
    loanDue,
    burn,
    runwayDays: burn > 0 ? Math.floor(cash / burn) : null,
  };
}

export function quoteDesk(state: WorldState): DeskSnapshot {
  const commerce = readCommerce(state);
  const playerId = state.localPlayerId;
  let shelfUnits = 0;
  let openContracts = 0;
  let shippingContracts = 0;
  let contractFace = 0;
  for (const shelf of commerce.shelves) {
    if (state.sites[shelf.parcelId]?.ownerId === playerId) {
      shelfUnits += shelf.quantity;
    }
  }
  for (const contract of commerce.contracts) {
    if (contract.status === 'open') {
      openContracts += 1;
    }
    if (contract.status === 'shipping') {
      shippingContracts += 1;
      contractFace += contract.unitPrice * contract.quantity;
    }
  }
  const cities = state.map.cities.map((city) => {
    const rival = commerce.rivals.find((outlet) => outlet.cityId === city.id);
    const campaign = commerce.campaigns.find((item) => item.cityId === city.id);
    const contractValue = commerce.contracts
      .filter((contract) => contract.cityId === city.id && contract.status !== 'lapsed')
      .reduce((sum, contract) => sum + contract.unitPrice * contract.quantity, 0);
    return {
      cityId: city.id,
      name: city.name,
      rivalName: rival?.nameZh ?? '',
      rivalPresence: rival?.presence ?? 0,
      campaignDays: campaign?.remainingDays ?? 0,
      contractValue,
    };
  });
  return {
    bank: summarizeBank(state),
    cashPlan: quoteCashPlan(state),
    share: marketShareOf(commerce),
    consumerRevenue: commerce.consumerRevenue,
    shelfUnits,
    openContracts,
    shippingContracts,
    contractFace,
    staffWage:
      commerce.staff.operators * STAFF_TABLE.operator.dailyWage +
      commerce.staff.clerks * STAFF_TABLE.clerk.dailyWage +
      commerce.staff.researchers * STAFF_TABLE.researcher.dailyWage,
    cities,
  };
}
