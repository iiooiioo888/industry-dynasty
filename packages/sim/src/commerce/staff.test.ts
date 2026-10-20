import { describe, expect, it } from 'vitest';
import {
  CLERK_SKILL_MAX_BONUS,
  OPERATOR_SKILL_MAX_BONUS,
  STAFF_SKILL_MAX,
  STAFF_SKILL_PER_DAY,
  clerkCoverage,
  emptyStaffSkill,
  growStaffSkill,
  operatorThroughputFactor,
  readStaffSkill,
  skillRatio,
} from './staff.js';
import type { StaffRoster } from './types.js';

const EMPTY: StaffRoster = { operators: 0, clerks: 0, researchers: 0 };

/**
 * 員工技能成長。
 *
 * 原本 `StaffRoster` 只有人數，請 6 個技師跟 6 個新人效率完全一樣 ——
 * 只有薪水在動。現在熟練度會隨在職天數累積，並實際提高產能與覆蓋率。
 */
describe('員工技能成長', () => {
  it('舊存檔沒有 skill 欄位時視為 0', () => {
    expect(readStaffSkill(EMPTY)).toEqual(emptyStaffSkill());
  });

  it('在職就會累積，且各職種分開算', () => {
    const staff: StaffRoster = { operators: 2, clerks: 0, researchers: 1 };
    const next = growStaffSkill(staff);
    expect(next.operator).toBe(STAFF_SKILL_PER_DAY);
    expect(next.clerk).toBe(0);
    expect(next.researcher).toBe(STAFF_SKILL_PER_DAY);
  });

  it('沒有人的職種不會成長', () => {
    const next = growStaffSkill({ ...EMPTY, skill: { operator: 40, clerk: 40, researcher: 40 } });
    expect(next).toEqual({ operator: 40, clerk: 40, researcher: 40 });
  });

  it('裁員不會讓熟練度倒退', () => {
    const staff: StaffRoster = {
      operators: 1,
      clerks: 1,
      researchers: 1,
      skill: { operator: 50, clerk: 50, researcher: 50 },
    };
    const grown = growStaffSkill(staff);
    expect(grown.operator).toBeGreaterThanOrEqual(50);
    // 全裁掉之後停在原值
    const idle = growStaffSkill({ ...EMPTY, skill: grown });
    expect(idle).toEqual(grown);
  });

  it('累積到上限就停住', () => {
    let skill = emptyStaffSkill();
    const staff: StaffRoster = { operators: 1, clerks: 1, researchers: 1 };
    for (let day = 0; day < 200; day += 1) {
      skill = growStaffSkill({ ...staff, skill });
    }
    for (const role of ['operator', 'clerk', 'researcher'] as const) {
      expect(skill[role]).toBe(STAFF_SKILL_MAX);
    }
  });

  it('25 天約累積到 50', () => {
    let skill = emptyStaffSkill();
    for (let day = 0; day < 25; day += 1) {
      skill = growStaffSkill({ ...EMPTY, operators: 1, skill });
    }
    expect(skill.operator).toBe(50);
  });

  it('skillRatio 介於 0 與 1，且處理異常輸入', () => {
    expect(skillRatio(0)).toBe(0);
    expect(skillRatio(STAFF_SKILL_MAX)).toBe(1);
    expect(skillRatio(STAFF_SKILL_MAX * 2)).toBe(1);
    expect(skillRatio(-10)).toBe(0);
    expect(skillRatio(Number.NaN)).toBe(0);
  });

  it('熟練度提高產線吞吐上限', () => {
    const line1 = operatorThroughputFactor(1, 1, 0);
    const line1Skilled = operatorThroughputFactor(1, 1, STAFF_SKILL_MAX);
    expect(line1Skilled).toBeGreaterThan(line1);
    // 加成直接疊在比值上：1 + 滿熟練度加成
    expect(line1Skilled).toBeCloseTo(1 + OPERATOR_SKILL_MAX_BONUS, 6);
    // 上限也跟著提高
    const capped = operatorThroughputFactor(20, 1, STAFF_SKILL_MAX);
    expect(capped).toBeCloseTo(1.2 + OPERATOR_SKILL_MAX_BONUS, 6);
  });

  it('熟練度也能救低配比的吞吐（不會低於下限）', () => {
    const raw = operatorThroughputFactor(1, 12, 0);
    const skilled = operatorThroughputFactor(1, 12, STAFF_SKILL_MAX);
    expect(raw).toBeCloseTo(0.45, 6);
    expect(skilled).toBeGreaterThan(raw);
    expect(skilled).toBeCloseTo(0.45 + OPERATOR_SKILL_MAX_BONUS, 6);
  });

  it('沒有技師時維持原產量，熟練度不影響', () => {
    expect(operatorThroughputFactor(0, 5, STAFF_SKILL_MAX)).toBe(1);
    expect(operatorThroughputFactor(3, 0, STAFF_SKILL_MAX)).toBe(1);
  });

  it('熟練度提高門市覆蓋率', () => {
    const raw = clerkCoverage(2, 4, 0);
    const skilled = clerkCoverage(2, 4, STAFF_SKILL_MAX);
    expect(raw).toBeCloseTo(0.5, 6);
    expect(skilled).toBeCloseTo(0.5 + CLERK_SKILL_MAX_BONUS, 6);
    expect(skilled).toBeLessThanOrEqual(1);
  });

  it('覆蓋率不會超過 1，且保留原本的邊界行為', () => {
    expect(clerkCoverage(10, 2, STAFF_SKILL_MAX)).toBe(1);
    // 沒有門市 → 視為滿覆蓋（與原行為一致）
    expect(clerkCoverage(0, 0, STAFF_SKILL_MAX)).toBe(1);
    // 有門市但沒店員 → 0
    expect(clerkCoverage(0, 3, STAFF_SKILL_MAX)).toBe(0);
  });
});
