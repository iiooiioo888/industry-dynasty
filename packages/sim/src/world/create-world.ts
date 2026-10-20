import { emptyPlayerBank } from '../bank/logic.js';
import { createOpeningContracts, emptyCommerce, seedRivals } from '../commerce/logic.js';
import { initialSimClock } from './clock.js';
import type { AuctionLot } from '../types/auction.js';
import { DEFAULT_STARTING_STOCK } from '../production/items.js';
import { createScenarioState, emptyPnL, generateNpcBuyOffers } from '../sales/index.js';
import type { GameMap, Parcel } from '../types/map.js';
import { createAuctionLot } from './auction-logic.js';
import { DEFAULT_WORLD_CONFIG, type WorldConfig } from './config.js';
import { quoteAuctionMinPrice } from './demand.js';
import { buildGeography } from './geography.js';
import type { Player, WorldState } from './state.js';

function buildMap(config: WorldConfig): GameMap {
  const geography = buildGeography(config.mapWidth, config.mapHeight);
  return {
    size: { width: config.mapWidth, height: config.mapHeight },
    parcels: geography.parcels,
    cities: geography.cities,
    denseZones: geography.denseZones,
    roads: geography.roads,
  };
}

function buildInitialAuctions(parcels: readonly Parcel[], config: WorldConfig): AuctionLot[] {
  const lots: AuctionLot[] = [];
  let index = 0;
  for (const parcel of parcels) {
    if (parcel.role !== 'land') {
      continue;
    }
    lots.push(
      createAuctionLot(parcel.id, quoteAuctionMinPrice(parcel, config), `lot-init-${index++}`),
    );
  }
  return lots;
}

export function createInitialWorld(config: Partial<WorldConfig> = {}): WorldState {
  const merged: WorldConfig = { ...DEFAULT_WORLD_CONFIG, ...config };
  const player: Player = {
    id: merged.playerId,
    name: merged.playerName,
    cash: merged.startingCash,
  };

  const map = buildMap(merged);
  const commerce = emptyCommerce();
  const rivals = seedRivals(map.cities);
  const contracts = createOpeningContracts(map.cities, 0, 0);

  return {
    map,
    players: { [player.id]: player },
    localPlayerId: player.id,
    auctionLots: buildInitialAuctions(map.parcels, merged),
    unpaidLandTax: {},
    taxTick: 0,
    buildTick: 0,
    productionTick: 0,
    financeTick: 0,
    bank: { [player.id]: emptyPlayerBank() },
    sites: {},
    inventories: { [player.id]: { ...DEFAULT_STARTING_STOCK } },
    craftedTotals: { [player.id]: {} },
    productionLines: {},
    gameDay: 0,
    npcBuyOffers: generateNpcBuyOffers(0),
    pnl: { [player.id]: emptyPnL() },
    scenario: createScenarioState(),
    clock: initialSimClock(),
    shipments: [],
    commerce: { ...commerce, rivals, contracts },
  };
}

export type { WorldConfig };
