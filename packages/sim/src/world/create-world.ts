import type { AuctionLot } from '../types/auction.js';
import { parcelIdFromCoords, type GameMap, type Parcel } from '../types/map.js';
import { generateParcelResource } from './parcel-resources.js';
import { createAuctionLot } from './auction-logic.js';
import { DEFAULT_WORLD_CONFIG, type WorldConfig } from './config.js';
import { DEFAULT_STARTING_STOCK } from '../production/items.js';
import { createScenarioState, emptyPnL, generateNpcBuyOffers } from '../sales/index.js';
import type { Player, WorldState } from './state.js';

function buildMap(config: WorldConfig): GameMap {
  const parcels: Parcel[] = [];
  for (let y = 0; y < config.mapHeight; y++) {
    for (let x = 0; x < config.mapWidth; x++) {
      parcels.push({
        id: parcelIdFromCoords(x, y),
        x,
        y,
        state: 'empty',
        ownerId: null,
        resource: generateParcelResource(x, y),
      });
    }
  }
  return { size: { width: config.mapWidth, height: config.mapHeight }, parcels };
}

function buildInitialAuctions(config: WorldConfig): AuctionLot[] {
  const lots: AuctionLot[] = [];
  let index = 0;
  for (let y = 0; y < config.mapHeight; y++) {
    for (let x = 0; x < config.mapWidth; x++) {
      const minPrice = config.auctionMinPriceBase + (x + y) * config.auctionMinPriceStep;
      lots.push(createAuctionLot(parcelIdFromCoords(x, y), minPrice, `lot-init-${index++}`));
    }
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

  return {
    map: buildMap(merged),
    players: { [player.id]: player },
    localPlayerId: player.id,
    auctionLots: buildInitialAuctions(merged),
    unpaidLandTax: {},
    taxTick: 0,
    buildTick: 0,
    productionTick: 0,
    sites: {},
    inventories: { [player.id]: { ...DEFAULT_STARTING_STOCK } },
    productionLines: {},
    gameDay: 0,
    npcBuyOffers: generateNpcBuyOffers(0),
    pnl: { [player.id]: emptyPnL() },
    scenario: createScenarioState(),
  };
}

export type { WorldConfig };
