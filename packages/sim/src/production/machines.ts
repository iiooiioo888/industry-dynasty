import type { RecipeStage } from './recipes.js';

/**
 * 加工機械。三檔產出的配方與產品 SKU 完全相同，
 * 差在裝機費、每日維護、週期、產量，以及對工人路程的敏感度。
 *
 * 開採線不吃速度與產量係數（槓桿為 0）：把高效爐裝上礦場不會挖得更快，
 * 只會多付維護，並且距離指數更陡。
 */
export type MachineGradeId = 'anvil-bench' | 'balance-press' | 'neighbor-kiln';

export interface MachineGradeDef {
  readonly id: MachineGradeId;
  readonly nameZh: string;
  readonly tierZh: '基礎' | '標準' | '高效';
  readonly installCost: number;
  /** 日結時加在廠房維護之上。正式規劃日有 48 刻產能，這筆是按日收的。 */
  readonly maintenancePerDay: number;
  /** 1 = 配方週期。小於 1 更快。開採線會把偏離 1 的部分乘上 0。 */
  readonly cycleMultiplier: number;
  readonly throughputMultiplier: number;
  readonly idleSensitivity: number;
  /** 工人到供應樞紐的步數超過此值就改走門檻懲罰。null 表示沒有門檻。 */
  readonly pathGateSteps: number | null;
  readonly gatedCycleMultiplier: number;
  readonly gatedThroughputMultiplier: number;
  /** 乘在階段距離指數上。高效爐更吃佈局，粗砧台比較寬容。 */
  readonly depthDragScale: number;
  readonly advantageZh: string;
}

export const MACHINE_GRADES = {
  'anvil-bench': {
    id: 'anvil-bench',
    nameZh: '粗砧台',
    tierZh: '基礎',
    installCost: 0,
    maintenancePerDay: 400,
    cycleMultiplier: 1.22,
    throughputMultiplier: 0.9,
    idleSensitivity: 0.6,
    pathGateSteps: null,
    gatedCycleMultiplier: 1.22,
    gatedThroughputMultiplier: 0.9,
    depthDragScale: 0.65,
    advantageZh:
      '不收裝機費，維護最低，長路程也不會再被門檻懲罰。週期較長、產量略低，深加工溢價留得少。',
  },
  'balance-press': {
    id: 'balance-press',
    nameZh: '衡壓機組',
    tierZh: '標準',
    installCost: 2_200,
    maintenancePerDay: 1_600,
    cycleMultiplier: 1,
    throughputMultiplier: 1,
    idleSensitivity: 1,
    pathGateSteps: null,
    gatedCycleMultiplier: 1,
    gatedThroughputMultiplier: 1,
    depthDragScale: 1,
    advantageZh: '週期與產量居中。短路程時加工溢價留得住；沒有額外的路程門檻。',
  },
  'neighbor-kiln': {
    id: 'neighbor-kiln',
    nameZh: '鄰焰精煉爐',
    tierZh: '高效',
    installCost: 6_400,
    maintenancePerDay: 4_800,
    cycleMultiplier: 0.64,
    throughputMultiplier: 1.22,
    idleSensitivity: 1.85,
    pathGateSteps: 4,
    gatedCycleMultiplier: 1.34,
    gatedThroughputMultiplier: 0.78,
    depthDragScale: 1.35,
    advantageZh:
      '工人 4 步以內才縮短週期並提高產量，深加工尤其明顯。超過 4 步改為又慢又少，維護仍照收。',
  },
} as const satisfies Record<MachineGradeId, MachineGradeDef>;

export const MACHINE_GRADE_LIST: readonly MachineGradeDef[] = [
  MACHINE_GRADES['anvil-bench'],
  MACHINE_GRADES['balance-press'],
  MACHINE_GRADES['neighbor-kiln'],
];

export const MACHINE_PRODUCT_NOTE = '產品相同，差在效率與成本。';

/** 開採不加速。加工與成品吃滿機械的週期／產量係數。 */
export function stageMachineLeverage(stage: RecipeStage): number {
  return stage === 'extract' ? 0 : 1;
}

export interface MachineTuning {
  readonly cycleMultiplier: number;
  readonly throughputMultiplier: number;
  readonly idleSensitivity: number;
  readonly depthDragScale: number;
  readonly pathGated: boolean;
}

export function resolveMachineTuning(
  grade: MachineGradeDef | null,
  stage: RecipeStage,
  travelSteps: number,
): MachineTuning {
  if (!grade) {
    return {
      cycleMultiplier: 1,
      throughputMultiplier: 1,
      idleSensitivity: 1,
      depthDragScale: 1,
      pathGated: false,
    };
  }
  const leverage = stageMachineLeverage(stage);
  const pathGated = grade.pathGateSteps != null && travelSteps > grade.pathGateSteps;
  const cycleBase = pathGated ? grade.gatedCycleMultiplier : grade.cycleMultiplier;
  const throughputBase = pathGated ? grade.gatedThroughputMultiplier : grade.throughputMultiplier;
  return {
    cycleMultiplier: 1 + (cycleBase - 1) * leverage,
    throughputMultiplier: 1 + (throughputBase - 1) * leverage,
    idleSensitivity: grade.idleSensitivity,
    depthDragScale: grade.depthDragScale,
    pathGated,
  };
}

export function machineUpgradeDue(previousPaid: number, installCost: number): number {
  return Math.max(0, installCost - Math.max(0, previousPaid));
}

export function machineCreditAfter(previousPaid: number, installCost: number): number {
  return Math.max(Math.max(0, previousPaid), installCost);
}
