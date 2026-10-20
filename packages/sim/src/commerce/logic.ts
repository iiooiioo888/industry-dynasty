import { FACTORY_TYPES } from '../buildings/catalog.js';
import { addItem, getItemQty, ITEMS, removeItem, type ItemId } from '../production/items.js';
import { quoteLocalDemand } from '../world/demand.js';
import type { Parcel } from '../types/map.js';
import type { ParcelId } from '../types/map.js';
import type { Player, WorldState } from '../world/state.js';
import { itemCityDemandFactor } from './cohorts.js';
import { MAX_CONCURRENT_EVENTS, combineMultiplier, rollNewsEvents } from './news.js';
import {
  advanceQualityBand,
  parcelSuitability,
  qualityPriceMultiplier,
  type QualityBand,
} from './quality.js';
import { respondToPlayerShare } from './rivals.js';
import { clerkCoverage, growStaffSkill, readStaffSkill } from './staff.js';
import {
  EMPTY_STAFF,
  type AdCampaign,
  type CityContract,
  type CommerceState,
  type ResearchJob,
  type RivalOutlet,
  type ShelfListing,
  type StaffRole,
  type StaffRoster,
  type WorldEvent,
} from './types.js';

export const CONSUMER_RESEARCH_ID = 'consumer-line';
export const CONSUMER_ITEM_IDS = [
  'hand-tool',
  'wire-bundle',
  'pack-module',
] as const satisfies readonly ItemId[];

export const RESEARCH_COST = 2_800;
export const RESEARCH_TICKS = 16;
export const QUALITY_PRICE_MUL = 1.12;
export const QUALITY_CYCLE_STRETCH = 1.08;

export const CAMPAIGN_COST = 1_800;
export const CAMPAIGN_DAYS = 4;
export const CAMPAIGN_BONUS = 0.28;

export const SHARE_TARGET = 0.12;
export const SHARE_MIN_REVENUE = 20_000;
export const CITY_DAILY_UNITS = 4;

export const STAFF_TABLE: Record<
  StaffRole,
  {
    readonly nameZh: string;
    readonly hireCost: number;
    readonly dailyWage: number;
    readonly cap: number;
  }
> = {
  operator: { nameZh: '產線技師', hireCost: 400, dailyWage: 80, cap: 12 },
  clerk: { nameZh: '門市店員', hireCost: 350, dailyWage: 70, cap: 12 },
  researcher: { nameZh: '研發員', hireCost: 800, dailyWage: 140, cap: 6 },
};

const RIVAL_NAMES = ['北岸聯號', '灣口商行', '站前舖'] as const;

export function emptyCommerce(): CommerceState {
  return {
    shelves: [],
    contracts: [],
    staff: EMPTY_STAFF,
    research: null,
    unlocked: [],
    qualityBand: 0,
    campaigns: [],
    events: [],
    rivals: [],
    consumerRevenue: 0,
    addressableValue: 0,
    wagesPaid: 0,
    penaltiesPaid: 0,
  };
}

export function readCommerce(state: WorldState): CommerceState {
  return state.commerce ?? emptyCommerce();
}

export function isConsumerItem(itemId: string): itemId is (typeof CONSUMER_ITEM_IDS)[number] {
  return (CONSUMER_ITEM_IDS as readonly string[]).includes(itemId);
}

export function consumerReferencePrice(): number {
  const sum = CONSUMER_ITEM_IDS.reduce((total, id) => total + ITEMS[id].unitValue, 0);
  return Math.max(1, Math.round(sum / CONSUMER_ITEM_IDS.length));
}

export function marketShareOf(
  commerce: Pick<CommerceState, 'consumerRevenue' | 'addressableValue'>,
): number {
  if (commerce.addressableValue <= 0) {
    return 0;
  }
  return commerce.consumerRevenue / commerce.addressableValue;
}

export function seedRivals(cities: readonly { id: string; name: string }[]): RivalOutlet[] {
  return cities.map((city, index) => ({
    id: `rival-${city.id}`,
    nameZh: RIVAL_NAMES[index % RIVAL_NAMES.length] ?? '同業門市',
    cityId: city.id,
    cityName: city.name,
    presence: 0.4,
  }));
}

export function createOpeningContracts(
  cities: readonly { id: string; name: string }[],
  gameDay: number,
  qualityBand: QualityBand,
): CityContract[] {
  return cities.map((city, index) => createCityContract(city, gameDay, index, qualityBand));
}

function createCityContract(
  city: { id: string; name: string },
  gameDay: number,
  index: number,
  qualityBand: QualityBand,
): CityContract {
  const itemId = CONSUMER_ITEM_IDS[(gameDay + index) % CONSUMER_ITEM_IDS.length] ?? 'hand-tool';
  const quality = qualityPriceMultiplier(qualityBand);
  const unitPrice = Math.max(1, Math.round(ITEMS[itemId].unitValue * 0.72 * quality));
  const quantity = 2 + ((gameDay + index) % 3);
  return {
    id: `contract-${city.id}-d${gameDay}-${index}`,
    cityId: city.id,
    cityName: city.name,
    itemId,
    quantity,
    unitPrice,
    dueDay: gameDay + 4,
    status: 'open',
    penalty: Math.round(unitPrice * quantity * 0.35),
    penalized: false,
  };
}

export function priceVolumeMultiplier(priceRatio: number): number {
  if (!Number.isFinite(priceRatio) || priceRatio <= 0) {
    return 0;
  }
  if (priceRatio <= 1) {
    return 1 + (1 - priceRatio) * 0.8;
  }
  return Math.max(0, 1 - (priceRatio - 1) * 1.6);
}

/**
 * 門市覆蓋率與產線吞吐係數都移到 `commerce/staff.ts`，
 * 因為它們現在要吃「員工熟練度」。這裡保留 re-export，
 * 既有呼叫端不必全部改。
 */
export { clerkCoverage, operatorThroughputFactor } from './staff.js';

export interface RetailQuote {
  readonly referencePrice: number;
  readonly units: number;
  readonly priceRatio: number;
  readonly clerkFactor: number;
  readonly rivalFactor: number;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function quoteRetailDay(args: {
  parcel: Parcel;
  itemId: ItemId;
  unitPrice: number;
  qualityBand: QualityBand;
  clerks: number;
  /** 店員熟練度（0–100），見 `commerce/staff.ts` */
  clerksSkill?: number;
  activeStores: number;
  rivals: readonly RivalOutlet[];
  campaigns: readonly AdCampaign[];
  events: readonly WorldEvent[];
}): RetailQuote {
  const local = quoteLocalDemand(args.parcel);
  const quality = qualityPriceMultiplier(args.qualityBand);
  const referencePrice = Math.max(
    1,
    Math.round(
      ITEMS[args.itemId].unitValue * (0.92 + 0.28 * clamp01(args.parcel.cityProximity)) * quality,
    ),
  );
  const priceRatio = args.unitPrice / referencePrice;
  const elasticity = priceVolumeMultiplier(priceRatio);
  const rival = args.rivals.find((outlet) => outlet.cityName === args.parcel.nearestCityName);
  const presence = rival?.presence ?? 0.55;
  const ad =
    args.campaigns.find((campaign) => campaign.cityName === args.parcel.nearestCityName)
      ?.demandBonus ?? 0;
  const eventBoost =
    args.events.find(
      (event) => event.kind === 'city-demand-up' && event.cityName === args.parcel.nearestCityName,
    )?.magnitude ?? 0;
  const rivalFactor = Math.max(0.2, 1 - presence + ad);
  // 規劃日不是日曆週。密集區大約三天可以消化一週的在地需求，門市才有得排班。
  // 人口分級：同一座城市裡，賣對商品的需求量高於賣錯商品。
  // 係數已正規化成消費品平均為 1，所以整體市場規模不變（見 `commerce/cohorts.ts`）。
  const cityName = args.parcel.nearestCityName;
  const cohortFactor = cityName ? itemCityDemandFactor(cityName, args.itemId) : 1;
  let units =
    Math.max(1, Math.round(local.weeklyVolume / 3)) *
    elasticity *
    (0.35 + 0.65 * clamp01(args.parcel.roadAccess)) *
    rivalFactor *
    (1 + eventBoost) *
    cohortFactor;
  if (args.parcel.cityProximity <= 0 && args.parcel.populationDensity < 20) {
    units *= 0.15;
  }
  const coverage = clerkCoverage(args.clerks, args.activeStores, args.clerksSkill ?? 0);
  units *= coverage;
  return {
    referencePrice,
    units: units <= 0 ? 0 : Math.max(0, Math.round(units)),
    priceRatio,
    clerkFactor: coverage,
    rivalFactor,
  };
}

/**
 * 舊的單一事件抽取器（`day % 9` 的硬寫桶子）已由 `commerce/news.ts`
 * 的樣板表取代。這裡保留一個薄包裝，回傳當天的第一個事件，
 * 讓既有呼叫端與測試不必一次全改；新程式碼請用 `rollNewsEvents`。
 */
export function rollWorldEvent(
  day: number,
  cities: readonly { id: string; name: string }[],
): WorldEvent | null {
  return rollNewsEvents(day, { cities })[0] ?? null;
}

/**
 * 運費乘數。多個事件並存時取**乘積**（`combineMultiplier`），
 * 而不是只認第一個 —— 否則同時兩個運費事件只有一個生效。
 */
export function freightMultiplier(events: readonly WorldEvent[]): number {
  return combineMultiplier(events, 'freight-up');
}

export function rawPortMultiplier(events: readonly WorldEvent[]): number {
  return combineMultiplier(events, 'port-raw-down');
}

function staffCount(staff: StaffRoster, role: StaffRole): number {
  if (role === 'operator') {
    return staff.operators;
  }
  if (role === 'clerk') {
    return staff.clerks;
  }
  return staff.researchers;
}

function withStaffCount(staff: StaffRoster, role: StaffRole, count: number): StaffRoster {
  if (role === 'operator') {
    return { ...staff, operators: count };
  }
  if (role === 'clerk') {
    return { ...staff, clerks: count };
  }
  return { ...staff, researchers: count };
}

function writeCommerce(state: WorldState, commerce: CommerceState, player?: Player): WorldState {
  return {
    ...state,
    commerce,
    players: player ? { ...state.players, [player.id]: player } : state.players,
  };
}

export function applyHireStaff(state: WorldState, role: StaffRole, count: number): WorldState {
  if (!Number.isInteger(count) || count <= 0) {
    return state;
  }
  const player = state.players[state.localPlayerId];
  if (!player) {
    return state;
  }
  const commerce = readCommerce(state);
  const spec = STAFF_TABLE[role];
  const have = staffCount(commerce.staff, role);
  const nextCount = Math.min(spec.cap, have + count);
  const hired = nextCount - have;
  if (hired <= 0) {
    return state;
  }
  const cost = hired * spec.hireCost;
  if (player.cash < cost) {
    return state;
  }
  return writeCommerce(
    state,
    {
      ...commerce,
      staff: withStaffCount(commerce.staff, role, nextCount),
      wagesPaid: commerce.wagesPaid + cost,
    },
    { ...player, cash: player.cash - cost },
  );
}

export function applyFireStaff(state: WorldState, role: StaffRole, count: number): WorldState {
  if (!Number.isInteger(count) || count <= 0) {
    return state;
  }
  const commerce = readCommerce(state);
  const have = staffCount(commerce.staff, role);
  const nextCount = Math.max(0, have - count);
  if (nextCount === have) {
    return state;
  }
  return writeCommerce(state, {
    ...commerce,
    staff: withStaffCount(commerce.staff, role, nextCount),
  });
}

export function applySetShelf(
  state: WorldState,
  parcelId: ParcelId,
  itemId: ItemId,
  unitPrice: number,
  quantity: number,
): WorldState {
  const player = state.players[state.localPlayerId];
  const parcel = state.map.parcels.find((entry) => entry.id.value === parcelId.value);
  const site = state.sites[parcelId.value];
  if (!player || !parcel || parcel.ownerId !== player.id) {
    return state;
  }
  if (!site || site.phase !== 'complete' || site.factoryTypeId !== 'storefront') {
    return state;
  }
  if (!isConsumerItem(itemId) || !Number.isInteger(unitPrice) || unitPrice <= 0) {
    return state;
  }
  if (!Number.isInteger(quantity) || quantity < 0) {
    return state;
  }
  const commerce = readCommerce(state);
  const existing = commerce.shelves.find((shelf) => shelf.parcelId === parcelId.value);
  let stock = state.inventories[player.id] ?? {};
  if (existing) {
    stock = addItem(stock, existing.itemId, existing.quantity);
  }
  const shelves = commerce.shelves.filter((shelf) => shelf.parcelId !== parcelId.value);
  if (quantity === 0) {
    return {
      ...state,
      inventories: { ...state.inventories, [player.id]: stock },
      commerce: { ...commerce, shelves },
    };
  }
  if (getItemQty(stock, itemId) < quantity) {
    return state;
  }
  const removed = removeItem(stock, itemId, quantity);
  if (!removed) {
    return state;
  }
  const listing: ShelfListing = { parcelId: parcelId.value, itemId, unitPrice, quantity };
  return {
    ...state,
    inventories: { ...state.inventories, [player.id]: removed },
    commerce: { ...commerce, shelves: [...shelves, listing] },
  };
}

export function applyStartResearch(state: WorldState, parcelId: ParcelId): WorldState {
  const player = state.players[state.localPlayerId];
  const site = state.sites[parcelId.value];
  if (!player || !site || site.phase !== 'complete' || site.ownerId !== player.id) {
    return state;
  }
  if (site.factoryTypeId !== 'lab') {
    return state;
  }
  const commerce = readCommerce(state);
  if (commerce.research || commerce.unlocked.includes(CONSUMER_RESEARCH_ID)) {
    return state;
  }
  if (player.cash < RESEARCH_COST) {
    return state;
  }
  const job: ResearchJob = {
    id: CONSUMER_RESEARCH_ID,
    parcelId: parcelId.value,
    progressTicks: 0,
    totalTicks: RESEARCH_TICKS,
    spent: RESEARCH_COST,
  };
  return writeCommerce(
    state,
    { ...commerce, research: job },
    { ...player, cash: player.cash - RESEARCH_COST },
  );
}

export function advanceResearch(state: WorldState): WorldState {
  const commerce = readCommerce(state);
  const job = commerce.research;
  if (!job || commerce.staff.researchers < 1) {
    return state;
  }
  const site = state.sites[job.parcelId];
  if (!site || site.phase !== 'complete' || FACTORY_TYPES[site.factoryTypeId].role !== 'research') {
    return state;
  }
  const progressTicks = job.progressTicks + 1;
  if (progressTicks < job.totalTicks) {
    return writeCommerce(state, { ...commerce, research: { ...job, progressTicks } });
  }
  // 研發完成後，品質檔位依「旗下最佳地塊的土壤／水質」決定能升到第幾檔
  // （見 `commerce/quality.ts`）。原本一律升到 1，地點毫無影響。
  const bestSuitability = state.map.parcels
    .filter((parcel) => parcel.ownerId === state.localPlayerId)
    .reduce((best, parcel) => Math.max(best, parcelSuitability(parcel).overall), 0);
  const qualityBand = advanceQualityBand({
    current: commerce.qualityBand,
    researched: true,
    bestSuitability,
  });
  return writeCommerce(state, {
    ...commerce,
    research: null,
    unlocked: commerce.unlocked.includes(job.id)
      ? commerce.unlocked
      : [...commerce.unlocked, job.id],
    qualityBand,
  });
}

export function applyBuyCampaign(state: WorldState, cityId: string): WorldState {
  const player = state.players[state.localPlayerId];
  const city = state.map.cities.find((entry) => entry.id === cityId);
  if (!player || !city || player.cash < CAMPAIGN_COST) {
    return state;
  }
  const commerce = readCommerce(state);
  const campaigns = [
    ...commerce.campaigns.filter((campaign) => campaign.cityId !== cityId),
    {
      cityId: city.id,
      cityName: city.name,
      remainingDays: CAMPAIGN_DAYS,
      demandBonus: CAMPAIGN_BONUS,
    },
  ];
  return writeCommerce(
    state,
    { ...commerce, campaigns },
    { ...player, cash: player.cash - CAMPAIGN_COST },
  );
}

function refreshContracts(
  commerce: CommerceState,
  state: WorldState,
  gameDay: number,
): CityContract[] {
  const kept = commerce.contracts.filter((contract) => {
    if (contract.status === 'shipping') {
      return true;
    }
    return contract.status === 'open' && gameDay <= contract.dueDay;
  });
  const covered = new Set(kept.map((contract) => contract.cityId));
  const opened = [...kept];
  state.map.cities.forEach((city, index) => {
    if (covered.has(city.id)) {
      return;
    }
    opened.push(createCityContract(city, gameDay, index, commerce.qualityBand));
  });
  return opened;
}

export interface CommerceDayResult {
  readonly state: WorldState;
  readonly retailRevenue: number;
  readonly wages: number;
  readonly upkeep: number;
  readonly penalties: number;
}

/** 日結的經營面：薪資、門市、違約、新聞、廣告與市佔分母。不改稅與廠房維護。 */
export function applyCommerceDay(state: WorldState, gameDay: number): CommerceDayResult {
  const player = state.players[state.localPlayerId];
  const commerce = readCommerce(state);
  if (!player) {
    return { state, retailRevenue: 0, wages: 0, upkeep: 0, penalties: 0 };
  }

  let cash = player.cash;
  const wageBill =
    commerce.staff.operators * STAFF_TABLE.operator.dailyWage +
    commerce.staff.clerks * STAFF_TABLE.clerk.dailyWage +
    commerce.staff.researchers * STAFF_TABLE.researcher.dailyWage;
  const paidWages = Math.min(wageBill, cash);
  cash -= paidWages;

  let upkeep = 0;
  for (const site of Object.values(state.sites)) {
    if (site.phase !== 'complete' || site.ownerId !== player.id) {
      continue;
    }
    upkeep += FACTORY_TYPES[site.factoryTypeId].dailyUpkeep;
  }
  const paidUpkeep = Math.min(upkeep, cash);
  cash -= paidUpkeep;

  const activeStores = commerce.shelves.filter((shelf) => shelf.quantity > 0).length;
  let retailRevenue = 0;
  const shelves = commerce.shelves.flatMap((shelf) => {
    const parcel = state.map.parcels.find((entry) => entry.id.value === shelf.parcelId);
    const site = state.sites[shelf.parcelId];
    if (!parcel || !site || site.phase !== 'complete' || site.factoryTypeId !== 'storefront') {
      return [];
    }
    const quote = quoteRetailDay({
      parcel,
      itemId: shelf.itemId,
      unitPrice: shelf.unitPrice,
      qualityBand: commerce.qualityBand,
      clerks: commerce.staff.clerks,
      clerksSkill: readStaffSkill(commerce.staff).clerk,
      activeStores,
      rivals: commerce.rivals,
      campaigns: commerce.campaigns,
      events: commerce.events,
    });
    const sold = Math.min(shelf.quantity, quote.units);
    if (sold > 0) {
      retailRevenue += sold * shelf.unitPrice;
    }
    const left = shelf.quantity - sold;
    return left > 0 ? [{ ...shelf, quantity: left }] : [];
  });
  cash += retailRevenue;

  let penalties = 0;
  const contracts = commerce.contracts.map((contract) => {
    if (contract.status !== 'shipping' || contract.penalized || gameDay <= contract.dueDay) {
      return contract;
    }
    const paid = Math.min(contract.penalty, cash);
    cash -= paid;
    penalties += paid;
    return { ...contract, penalized: true };
  });

  const events = commerce.events
    .map((event) => ({ ...event, remainingDays: event.remainingDays - 1 }))
    .filter((event) => event.remainingDays > 0);
  // 事件改成資料驅動的樣板表（見 `commerce/news.ts`），仍然一天最多一個，
  // 且同類型不重複，避免乘數疊加失控。
  if (events.length < MAX_CONCURRENT_EVENTS) {
    const rolled = rollNewsEvents(
      gameDay,
      { cities: state.map.cities },
      events.map((event) => event.kind),
    );
    events.push(...rolled);
  }
  const campaigns = commerce.campaigns
    .map((campaign) => ({ ...campaign, remainingDays: campaign.remainingDays - 1 }))
    .filter((campaign) => campaign.remainingDays > 0);

  const addressableValue =
    commerce.addressableValue +
    state.map.cities.length * CITY_DAILY_UNITS * consumerReferencePrice();

  // 對手會依玩家整體市佔反制（見 `commerce/rivals.ts`）：
  // 吃下市場會讓對手加碼，聲勢回落則慢慢退場。
  const shareNow = marketShareOf({
    consumerRevenue: commerce.consumerRevenue + retailRevenue,
    addressableValue,
  });
  const rivalResponse = respondToPlayerShare(commerce.rivals, shareNow);

  // 在職訓練：員工每天累積熟練度（見 `commerce/staff.ts`）
  const grownSkill = growStaffSkill(commerce.staff);

  const nextCommerce: CommerceState = {
    ...commerce,
    staff: { ...commerce.staff, skill: grownSkill },
    shelves,
    contracts: refreshContracts(
      { ...commerce, contracts, qualityBand: commerce.qualityBand },
      state,
      gameDay,
    ),
    campaigns,
    events,
    rivals: rivalResponse.rivals,
    consumerRevenue: commerce.consumerRevenue + retailRevenue,
    addressableValue,
    wagesPaid: commerce.wagesPaid + paidWages,
    penaltiesPaid: commerce.penaltiesPaid + penalties,
  };

  return {
    state: {
      ...state,
      players: { ...state.players, [player.id]: { ...player, cash } },
      commerce: nextCommerce,
    },
    retailRevenue,
    wages: paidWages,
    upkeep: paidUpkeep,
    penalties,
  };
}

export function noteContractRevenue(
  state: WorldState,
  grossRevenue: number,
  contractId: string,
): WorldState {
  const commerce = readCommerce(state);
  return {
    ...state,
    commerce: {
      ...commerce,
      consumerRevenue: commerce.consumerRevenue + grossRevenue,
      contracts: commerce.contracts.map((contract) =>
        contract.id === contractId ? { ...contract, status: 'fulfilled' as const } : contract,
      ),
    },
  };
}
