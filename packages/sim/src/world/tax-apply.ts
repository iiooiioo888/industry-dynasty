import type { AuctionLot } from '../types/auction.js';
import { clearProductionAtParcel } from './production-reducer.js';
import { processParcelTax } from './tax-logic.js';
import type { WorldConfig } from './config.js';
import type { Parcel } from '../types/map.js';
import type { Player, WorldState } from './state.js';

let taxLotCounter = 50_000;

function nextTaxLotId(): string {
  taxLotCounter += 1;
  return `lot-tax-${taxLotCounter}`;
}

function updatePlayer(players: WorldState['players'], player: Player): WorldState['players'] {
  return { ...players, [player.id]: player };
}

export function applyTaxTick(state: WorldState, config: WorldConfig): WorldState {
  let players = state.players;
  const unpaidLandTax = { ...state.unpaidLandTax };
  const sites = { ...state.sites };
  let productionLines = { ...state.productionLines };
  const auctionLots: AuctionLot[] = [...state.auctionLots];
  const owned = state.map.parcels.filter((p) => p.ownerId !== null);
  // 先收集變更，最後只做**一次**陣列重建。
  // 原本每塊地都呼叫一次 `updateParcelInMap`，等於每 tick 做
  // 「持有地塊數 × 全部地塊數」次迭代，並產生同樣數量的新陣列；
  // 而每個新陣列都會讓地塊索引與路徑快取失效。
  const changed = new Map<string, Parcel>();

  for (const parcel of owned) {
    const ownerId = parcel.ownerId!;
    const player = players[ownerId];
    if (!player) {
      continue;
    }

    const key = parcel.id.value;
    const currentUnpaid = unpaidLandTax[key] ?? 0;
    const outcome = processParcelTax(parcel, player, currentUnpaid, config, nextTaxLotId());

    changed.set(key, outcome.parcel);
    if (outcome.player) {
      players = updatePlayer(players, outcome.player);
    }
    if (outcome.reauctioned) {
      delete unpaidLandTax[key];
      delete sites[key];
      productionLines = clearProductionAtParcel(productionLines, key);
      if (outcome.newLot) {
        auctionLots.push(outcome.newLot);
      }
    } else {
      unpaidLandTax[key] = outcome.unpaidLandTax;
    }
  }

  // 沒有變更就沿用同一個 map 物件，快取得以跨 tick 存活
  const map =
    changed.size === 0
      ? state.map
      : {
          ...state.map,
          parcels: state.map.parcels.map((parcel) => changed.get(parcel.id.value) ?? parcel),
        };

  return {
    ...state,
    map,
    players,
    unpaidLandTax,
    sites,
    productionLines,
    auctionLots,
    taxTick: state.taxTick + 1,
  };
}
