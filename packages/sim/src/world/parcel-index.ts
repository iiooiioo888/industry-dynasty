import type { Parcel } from '../types/map.js';

/**
 * 地塊索引 · parcel index
 *
 * `map.parcels` 在 16×12 地圖上有 192 筆。`findParcel`、`getParcelAt` 這類
 * 「找一塊地」的查詢原本都是 `Array.prototype.find` 線性掃描，而它們在
 * 策略評估（`proximityScore`、`openLots`）與每個 tick 的 reducer 裡被反覆呼叫，
 * 形成 O(地塊數 × 查詢次數) 的熱點。
 *
 * 這裡把它們換成 O(1) 查詢。
 *
 * ## 為什麼是「延遲建置」
 *
 * 地塊陣列每個 tick 都會因為稅務、建造、換手而換一個新版本，
 * 所以索引會頻繁重建 —— 而重建本身就成了新的熱點（實測 CPU 19%）。
 * 兩個索引因此各自延遲：只查座標的呼叫端不會付 id `Map` 的建置成本，
 * 反之亦然。座標索引用 `Int32Array`（存陣列下標）而不是 `Map`，
 * 建置成本只有一次線性掃描。
 *
 * ## 快取策略
 *
 * 以 `map.parcels` 的**陣列 identity** 為鍵。每次地塊變更
 * （蓋路、完工、拆除、換手）都是由 `updateParcelInMap` 產生新陣列，
 * 因此快取自動失效，不需要手動清除，也不會有「忘記清快取」的錯誤。
 *
 * ## 為什麼要「先到先得」
 *
 * 舊實作是 `Array.find`，回傳**第一個**符合的地塊。若資料裡出現重複的
 * id 或座標，索引必須回傳同一個，否則行為會改變。因此寫入時
 * 只在鍵尚未存在時才設置。
 */
export class ParcelIndex {
  readonly #parcels: readonly Parcel[];
  readonly #width: number;
  readonly #height: number;
  #byId: Map<string, Parcel> | null = null;
  #cellToIndex: Int32Array | null = null;

  constructor(parcels: readonly Parcel[], width: number, height: number) {
    this.#parcels = parcels;
    this.#width = width;
    this.#height = height;
  }

  /** id → 地塊。首次呼叫才建置。 */
  byId(): ReadonlyMap<string, Parcel> {
    if (this.#byId === null) {
      const map = new Map<string, Parcel>();
      for (const parcel of this.#parcels) {
        if (!map.has(parcel.id.value)) {
          map.set(parcel.id.value, parcel);
        }
      }
      this.#byId = map;
    }
    return this.#byId;
  }

  /**
   * 依 id 取地塊，等價於 `byId().get(id)`。
   *
   * 引擎建立的地塊 id 一律是 `${x},${y}`（見 `parcelIdFromCoords`），
   * 所以先走 O(1) 座標查詢，**再用 id 字串相等驗證**回傳的地塊是否真的是它。
   * 驗證失敗（例如外部塞進非標準 id）才退回建置完整的 id `Map`，
   * 因此正確性不受 id 格式影響，而常見路徑不必付出建置 `Map` 的成本。
   */
  byIdValue(id: string): Parcel | undefined {
    const comma = id.indexOf(',');
    if (comma > 0) {
      const x = Number(id.slice(0, comma));
      const y = Number(id.slice(comma + 1));
      if (Number.isInteger(x) && Number.isInteger(y)) {
        const parcel = this.at(x, y);
        if (parcel !== undefined && parcel.id.value === id) {
          return parcel;
        }
      }
    }
    return this.byId().get(id);
  }

  /** 座標 → 地塊。首次呼叫才建置。 */
  at(x: number, y: number): Parcel | undefined {
    if (x < 0 || y < 0 || x >= this.#width || y >= this.#height) {
      return undefined;
    }
    if (this.#cellToIndex === null) {
      const cells = new Int32Array(this.#width * this.#height).fill(-1);
      for (let index = 0; index < this.#parcels.length; index += 1) {
        const parcel = this.#parcels[index]!;
        if (parcel.x < 0 || parcel.y < 0 || parcel.x >= this.#width || parcel.y >= this.#height) {
          continue;
        }
        const cell = parcel.y * this.#width + parcel.x;
        if (cells[cell] === -1) {
          cells[cell] = index;
        }
      }
      this.#cellToIndex = cells;
    }
    const index = this.#cellToIndex[y * this.#width + x] ?? -1;
    return index < 0 ? undefined : this.#parcels[index];
  }
}

const indexCache = new WeakMap<readonly Parcel[], ParcelIndex>();
const holdingsCache = new WeakMap<readonly Parcel[], Map<string, readonly Parcel[]>>();

export function parcelIndex(
  parcels: readonly Parcel[],
  width: number,
  height: number,
): ParcelIndex {
  const cached = indexCache.get(parcels);
  if (cached !== undefined) {
    return cached;
  }
  const index = new ParcelIndex(parcels, width, height);
  indexCache.set(parcels, index);
  return index;
}

/** 這名玩家持有的地塊（順序與 `map.parcels` 相同，等同舊的 `filter`）。 */
export function parcelsOwnedBy(parcels: readonly Parcel[], playerId: string): readonly Parcel[] {
  let perPlayer = holdingsCache.get(parcels);
  if (perPlayer === undefined) {
    perPlayer = new Map();
    holdingsCache.set(parcels, perPlayer);
  }
  const cached = perPlayer.get(playerId);
  if (cached !== undefined) {
    return cached;
  }
  const owned = parcels.filter((parcel) => parcel.ownerId === playerId);
  perPlayer.set(playerId, owned);
  return owned;
}
