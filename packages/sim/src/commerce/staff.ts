import type { StaffRole, StaffRoster } from './types.js';

/**
 * 員工技能成長 · staff skill
 *
 * 原本 `StaffRoster` 只有三個**人數**欄位，員工不會變強：
 * 請 6 個技師跟請 6 個新人在效率上完全一樣，只有薪水在動。
 *
 * 這裡讓每個職種有 0–100 的熟練度：
 * - **在職就會累積**（每天 +2，約 25 天到 50）
 * - 熟練度提高產線吞吐上限與門市覆蓋率
 * - 換人／裁員不會歸零（技能留在組織裡），但沒人在職就不成長
 *
 * 決定性：純粹由「在職天數」決定，沒有亂數 —— 模擬必須可重現。
 */
export type StaffSkill = Readonly<Record<StaffRole, number>>;

export const STAFF_SKILL_MAX = 100;
/** 每在職一天累積的熟練度 */
export const STAFF_SKILL_PER_DAY = 2;

export function emptyStaffSkill(): StaffSkill {
  return { operator: 0, clerk: 0, researcher: 0 };
}

/** 讀出熟練度；舊存檔沒有這個欄位時視為 0。 */
export function readStaffSkill(staff: StaffRoster): StaffSkill {
  return staff.skill ?? emptyStaffSkill();
}

/**
 * 一天的在職訓練。
 *
 * 只在**該職種有人**時成長 —— 全裁掉之後技能就停住（不會倒退）。
 */
export function growStaffSkill(staff: StaffRoster): StaffSkill {
  const current = readStaffSkill(staff);
  const next: Record<StaffRole, number> = { ...current };
  if (staff.operators > 0) {
    next.operator = Math.min(STAFF_SKILL_MAX, current.operator + STAFF_SKILL_PER_DAY);
  }
  if (staff.clerks > 0) {
    next.clerk = Math.min(STAFF_SKILL_MAX, current.clerk + STAFF_SKILL_PER_DAY);
  }
  if (staff.researchers > 0) {
    next.researcher = Math.min(STAFF_SKILL_MAX, current.researcher + STAFF_SKILL_PER_DAY);
  }
  return next;
}

/** 熟練度換算成 0–1 的比例。 */
export function skillRatio(skill: number): number {
  if (!Number.isFinite(skill) || skill <= 0) {
    return 0;
  }
  return Math.min(1, skill / STAFF_SKILL_MAX);
}

/** 產線技師的熟練度能額外提高多少吞吐上限（0–0.15）。 */
export const OPERATOR_SKILL_MAX_BONUS = 0.15;

/**
 * 產線吞吐係數。
 *
 * @param operators 技師人數
 * @param runningLines 正在運轉的產線數
 * @param skill 技師熟練度（0–100）
 */
export function operatorThroughputFactor(
  operators: number,
  runningLines: number,
  skill = 0,
): number {
  const bonus = skillRatio(skill) * OPERATOR_SKILL_MAX_BONUS;
  if (operators <= 0 || runningLines <= 0) {
    return 1;
  }
  const ratio = operators / runningLines;
  // 熟練度是**加成到比值上**，不是只挪動上下限 ——
  // 否則「一人一線」（比值 1）時技能完全沒有作用。
  return Math.min(1.2 + bonus, Math.max(0.45 + bonus, ratio + bonus));
}

/** 門市店員的熟練度最多能多補多少覆蓋率（0–0.12）。 */
export const CLERK_SKILL_MAX_BONUS = 0.12;

/** 門市覆蓋率（熟練度會往上加）。 */
export function clerkCoverage(clerks: number, activeStores: number, skill = 0): number {
  // 與原行為一致：沒有門市時覆蓋率視為滿；有門市但沒店員就是 0
  if (activeStores <= 0) {
    return 1;
  }
  if (clerks <= 0) {
    return 0;
  }
  const base = Math.min(1, clerks / activeStores);
  return Math.min(1, base + skillRatio(skill) * CLERK_SKILL_MAX_BONUS);
}
