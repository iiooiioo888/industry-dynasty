import {
  MACHINE_GRADE_LIST,
  MACHINE_PRODUCT_NOTE,
  type MachineGradeId,
} from '@industry-dynasty/sim';
import './MachineCompare.css';

export interface MachineCompareProps {
  selected?: MachineGradeId | null;
  cash?: number;
  onSelect?: (grade: MachineGradeId) => void;
  /** 在這塊地上、目前配方的每刻毛利。沒有則只比較靜態規格。 */
  profitPerTick?: Partial<Record<MachineGradeId, number>>;
  compact?: boolean;
}

function formatProfit(value: number): string {
  return value.toLocaleString('zh-Hant', { maximumFractionDigits: 0 });
}

export function MachineCompare({
  selected,
  cash,
  onSelect,
  profitPerTick,
  compact = false,
}: MachineCompareProps) {
  return (
    <div className={`machine-compare${compact ? ' is-compact' : ''}`}>
      {compact ? null : <p className="machine-note">{MACHINE_PRODUCT_NOTE}</p>}
      <ul className="machine-list">
        {MACHINE_GRADE_LIST.map((grade) => {
          const affordable = cash === undefined || cash >= grade.installCost;
          const active = selected === grade.id;
          const profit = profitPerTick?.[grade.id];
          const body = (
            <>
              <span className="machine-title">
                <strong>{grade.nameZh}</strong>
                <span className="machine-tier">{grade.tierZh}</span>
              </span>
              <span className="machine-spec">
                裝機 ${grade.installCost.toLocaleString('zh-Hant')} · 維護 $
                {grade.maintenancePerDay.toLocaleString('zh-Hant')}/日
                {profit !== undefined ? ` · 此處每刻 ${formatProfit(profit)}` : ''}
              </span>
              {compact ? null : <span className="machine-advantage">{grade.advantageZh}</span>}
            </>
          );
          return (
            <li key={grade.id}>
              {onSelect ? (
                <button
                  type="button"
                  className={`machine-card${active ? ' is-selected' : ''}`}
                  aria-pressed={active}
                  disabled={!affordable && !active}
                  onClick={() => onSelect(grade.id)}
                >
                  {body}
                </button>
              ) : (
                <div className="machine-card">{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
