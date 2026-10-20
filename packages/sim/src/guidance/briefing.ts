import type { StageDef } from '../balance/stages.js';

/**
 * 關卡開場簡報 · stage briefing
 *
 * 原本開局只有一行 `briefing` 文字直接跳進地圖，玩家看不出：
 * 這一關的目標是什麼、有多少天、建議做多大。
 *
 * 這裡把關卡定義整理成「開場該看到的那幾行」，順便把數字格式化 ——
 * 純函式，可以測試，也讓 UI 不必自己組字串。
 */
export interface BriefingLine {
  readonly label: string;
  readonly value: string;
  /** 值得強調的（例如目標） */
  readonly emphasis?: boolean;
}

export interface StageBriefing {
  readonly title: string;
  readonly era: string;
  readonly opening: string;
  readonly lines: readonly BriefingLine[];
  /** 這一關的核心提示（給新手看的那一句） */
  readonly focus: string;
}

/** 依難度給一句「焦點」提示 —— 比通用文案更能對應關卡處境。 */
function focusFor(stage: StageDef): string {
  if (stage.index <= 3) {
    return '先學會賺錢：買地、蓋工坊、開產線、把貨賣掉。';
  }
  if (stage.index <= 10) {
    return '這一關開始需要加工：把原料壓成零件，價值才會加上去。';
  }
  if (stage.index <= 19) {
    return '六塊地是這個階段的合理規模；超過反而被稅金與維護拖垮。';
  }
  return '最後幾關要靠深加工：合金板再加工成精密模組，產值才會跳一階。';
}

export function buildBriefing(stage: StageDef): StageBriefing {
  return {
    title: stage.nameZh,
    era: stage.eraLabel,
    opening: stage.briefing,
    focus: focusFor(stage),
    lines: [
      { label: '可用天數', value: `${stage.maxDays} 天` },
      { label: '起始資金', value: `$${stage.startingCash.toLocaleString()}` },
      {
        label: '目標淨利',
        value: `$${stage.targets.netProfit.toLocaleString()}`,
        emphasis: true,
      },
      {
        label: '目標加工產值',
        value: `$${stage.targets.craftedValue.toLocaleString()}`,
        emphasis: true,
      },
      {
        label: '目標清償貸款',
        value: `$${stage.targets.debtRepaid.toLocaleString()}`,
      },
      {
        label: '建議規模',
        value: `${stage.recommendedParcels} 塊地 · ${
          stage.recommendedDepth === 1 ? '一階加工' : '二階加工'
        }`,
      },
    ],
  };
}
