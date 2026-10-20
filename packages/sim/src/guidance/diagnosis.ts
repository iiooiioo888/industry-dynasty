import { FACTORY_TYPES } from '../buildings/catalog.js';
import { readCommerce } from '../commerce/logic.js';
import { craftedValue } from '../production/chain.js';
import { netProfit } from '../sales/pnl.js';
import type { ScenarioState, WinContext } from '../sales/scenario.js';
import type { WorldState } from '../world/state.js';

/**
 * 敗因診斷 · post-mortem
 *
 * 原本輸掉只顯示「時間到，未達標」—— 玩家不知道自己做錯了什麼。
 * 這裡從最終狀態推導幾個具體原因，依嚴重度排序，每個都附一句**可以怎麼做**。
 *
 * 設計原則：**只報「有證據」的原因**。每一條都要有數字支撐，
 * 不能寫「你可能擴張太快」這種沒有依據的話。
 */
export type DiagnosisId =
  | 'no-processing'
  | 'production-idle'
  | 'no-retail'
  | 'no-staff'
  | 'too-small'
  | 'costs-eat-profit'
  | 'unpaid-tax'
  | 'no-sales'
  | 'short-of-target';

export interface Diagnosis {
  readonly id: DiagnosisId;
  /** 0–100，越高越該先看 */
  readonly severity: number;
  /** 一句話說明發生什麼 */
  readonly headline: string;
  /** 一句話說明可以做什麼 */
  readonly hint: string;
}

export interface DiagnosisInput {
  readonly state: WorldState;
  readonly scenario: ScenarioState;
  readonly context?: WinContext;
}

function countSites(state: WorldState, playerId: string) {
  let production = 0;
  let retail = 0;
  for (const site of Object.values(state.sites)) {
    if (site.ownerId !== playerId || site.phase !== 'complete') {
      continue;
    }
    const role = FACTORY_TYPES[site.factoryTypeId].role;
    if (role === 'production') {
      production += 1;
    } else if (role === 'retail') {
      retail += 1;
    }
  }
  return { production, retail };
}

/**
 * 診斷這一局為什麼沒達標。
 *
 * 回傳已排序的清單（嚴重度高→低）；沒有明顯問題時回傳單一「差一點」條目。
 */
export function diagnoseLoss(input: DiagnosisInput): Diagnosis[] {
  const { state, scenario } = input;
  const playerId = state.localPlayerId;
  const pnl = state.pnl[playerId];
  const profit = netProfit(pnl);
  const crafted = craftedValue(state.craftedTotals[playerId]);
  const { production, retail } = countSites(state, playerId);
  const commerce = readCommerce(state);
  const revenue = (pnl?.revenue ?? 0) + commerce.consumerRevenue;
  const fixed = (pnl?.maintenance ?? 0) + (pnl?.taxPaid ?? 0) + (pnl?.wages ?? 0);
  const unpaid = state.unpaidLandTax[playerId] ?? 0;

  const found: Diagnosis[] = [];

  if (crafted <= 0) {
    found.push({
      id: 'no-processing',
      severity: 95,
      headline: '整局沒有做出任何加工品（加工產值 0）',
      hint: '工業化路線要求加工產值。蓋一座工坊跑「基礎零件」，別只賣原料。',
    });
  }

  if (production === 0) {
    found.push({
      id: 'too-small',
      severity: 90,
      headline: '沒有任何完工的生產工廠',
      hint: '買地 → 建工坊 → 開產線。沒有工廠就沒有產出。',
    });
  } else if (production < 3) {
    found.push({
      id: 'too-small',
      severity: 55,
      headline: `只有 ${production} 座生產工廠，規模不足以支撐目標`,
      hint: '前三關建議 3 塊地起；後段需要 6 塊地才有足夠供料。',
    });
  }

  if ((pnl?.productionIdleLoss ?? 0) > 0) {
    found.push({
      id: 'production-idle',
      severity: 80,
      headline: `產線閒置造成 ${Math.round(pnl!.productionIdleLoss).toLocaleString()} 的損失`,
      hint: '閒置通常是缺料或缺技師。確認上游產能夠不夠，或補僱技師。',
    });
  }

  if (revenue <= 0) {
    found.push({
      id: 'no-sales',
      severity: 85,
      headline: '整局沒有任何營收',
      hint: '庫存不等於現金。到市場面板把貨賣給開價最好的買家。',
    });
  }

  if (retail === 0 && commerce.consumerRevenue <= 0) {
    found.push({
      id: 'no-retail',
      severity: 45,
      headline: '沒有門市，也沒有任何消費營收',
      hint: '門市能吃下城市需求，也是「商業路線」的唯一入口。',
    });
  }

  if (commerce.staff.operators === 0 && production > 0) {
    found.push({
      id: 'no-staff',
      severity: 40,
      headline: '沒有僱用任何產線技師',
      hint: '技師會拉高產線吞吐，而且在職越久越熟練。',
    });
  }

  if (fixed > 0 && revenue > 0 && fixed / revenue > 0.35) {
    found.push({
      id: 'costs-eat-profit',
      severity: 70,
      headline: `固定成本佔營收 ${Math.round((fixed / revenue) * 100)}%`,
      hint: '土地稅、維護與薪資把利潤吃掉了。減少閒置土地，或提高單位產值。',
    });
  }

  if (unpaid > 0) {
    found.push({
      id: 'unpaid-tax',
      severity: 65,
      headline: `還有 ${Math.round(unpaid).toLocaleString()} 的欠稅`,
      hint: '欠稅累積到門檻，土地會被收回拍賣。先留現金繳稅。',
    });
  }

  // 沒有「嚴重」問題時，補一條「差一點」—— 玩家需要知道距離目標多遠。
  // 門檻用嚴重度而不是「完全沒有其他條目」：像「沒有門市」這種中等問題
  // 不該把「你其實快到了」這個重要訊息擠掉。
  const hasSerious = found.some((reason) => reason.severity >= 60);
  if (!hasSerious) {
    found.push({
      id: 'short-of-target',
      severity: 30,
      headline: `差一點：淨利 ${Math.round(profit).toLocaleString()} / ${scenario.config.targetNetProfit.toLocaleString()}`,
      hint: '配置沒有嚴重問題，差的是規模或時間分配。試著把產線提早一兩天開起來。',
    });
  }

  return found.sort((a, b) => b.severity - a.severity);
}
