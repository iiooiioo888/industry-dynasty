import type { AuctionLot } from '../types/auction.js';
import { parcelIdFromCoords, type GameMap, type Parcel } from '../types/map.js';
import { createAuctionLot } from './auction-logic.js';
import { DEFAULT_WORLD_CONFIG, type WorldConfig } from './config.js';
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
    sites: {},
  };
}

export type { WorldConfig };
