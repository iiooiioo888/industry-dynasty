import type { AuctionLot } from '../types/auction.js';
import type { Parcel, ParcelId } from '../types/map.js';
import type { Player } from './state.js';

export interface BidValidation {
  ok: boolean;
  reason?: string;
}

export function minNextBid(lot: AuctionLot): number {
  if (lot.highBidderId === null) {
    return lot.minPrice;
  }
  return lot.highBid + 1;
}

export function validateBid(lot: AuctionLot, player: Player, amount: number): BidValidation {
  if (lot.status !== 'open') {
    return { ok: false, reason: '拍賣已結束' };
  }
  if (amount < lot.minPrice) {
    return {
      ok: false,
      reason: `出價 $${formatMoney(amount)} 低於底價 $${formatMoney(lot.minPrice)}，這筆沒有送出。`,
    };
  }
  const required = minNextBid(lot);
  if (amount < required) {
    return {
      ok: false,
      reason: `出價須至少 $${formatMoney(required)}，這筆沒有送出。`,
    };
  }
  if (player.cash < amount) {
    return { ok: false, reason: '現金不足，這筆沒有送出。' };
  }
  return { ok: true };
}

export function applyBidToLot(lot: AuctionLot, playerId: string, amount: number): AuctionLot {
  return {
    ...lot,
    highBid: amount,
    highBidderId: playerId,
  };
}

export interface SettleResult {
  parcel: Parcel;
  player: Player | null;
  lot: AuctionLot;
  sold: boolean;
}

export function settleLot(
  lot: AuctionLot,
  parcel: Parcel,
  player: Player | undefined,
): SettleResult {
  if (lot.status !== 'open') {
    return { parcel, player: player ?? null, lot, sold: false };
  }

  if (!lot.highBidderId || lot.highBid < lot.minPrice) {
    return { parcel, player: player ?? null, lot, sold: false };
  }

  const winner = player;
  if (!winner || winner.cash < lot.highBid) {
    return { parcel, player: winner ?? null, lot, sold: false };
  }

  const updatedPlayer: Player = {
    ...winner,
    cash: winner.cash - lot.highBid,
  };

  const updatedParcel: Parcel = {
    ...parcel,
    state: 'owned',
    ownerId: lot.highBidderId,
  };

  return {
    parcel: updatedParcel,
    player: updatedPlayer,
    lot: { ...lot, status: 'closed' },
    sold: true,
  };
}

function formatMoney(amount: number): string {
  return amount.toLocaleString('zh-TW');
}

export function createAuctionLot(parcelId: ParcelId, minPrice: number, id: string): AuctionLot {
  return {
    id,
    parcelId,
    minPrice,
    highBid: 0,
    highBidderId: null,
    status: 'open',
  };
}
