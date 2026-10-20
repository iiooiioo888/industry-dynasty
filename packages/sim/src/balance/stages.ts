/**
 * 關卡表 · stages
 *
 * 原型《創業王》有 **22 個關卡**，每關有年代區間、起始資金、難度與一組目標
 * （`Stages.csv`：年獲利／資產／現金／清償貸款）。本專案原本只有單一
 * 「25 天、三條勝利路線」的局，沒有推進感。
 *
 * 這裡建立關卡表。每一關只調整**輸入**（起始資金、天數、目標組、難度），
 * 不新增規則 —— 這樣平衡仍然可以被既有護欄驗證。
 *
 * 設計原則：
 * - 年代往前走，目標只升不降（`netProfit` 與 `craftedValue` 皆單調遞增）。
 * - 起始資金不成長得比目標快，否則後面的關卡反而更簡單。
 * - 前三關是教學坡度：先學會賺錢、再學會加工、最後才要求通路。
 */

export interface StageTargets {
  /** 通關淨利門檻 */
  readonly netProfit: number;
  /** 累計加工產值門檻（工業化路線） */
  readonly craftedValue: number;
  /** 累計清償貸款門檻（還款路線） */
  readonly debtRepaid: number;
}

export interface StageDef {
  readonly id: string;
  /** 關卡編號，從 1 開始 */
  readonly index: number;
  readonly nameZh: string;
  /** 年代區間，例如「1950–1960」 */
  readonly eraLabel: string;
  /** 起始現金 */
  readonly startingCash: number;
  /** 這關的天數上限 */
  readonly maxDays: number;
  /** 1（寬鬆）～ 5（嚴苛） */
  readonly difficulty: 1 | 2 | 3 | 4 | 5;
  /**
   * 實測可通關的最小規模（地塊數）。
   *
   * 這不是猜的：`reports/stage-winnability.test.ts` 會用這組數字
   * 實際跑一次完整迴圈，要求每一關都真的打得過。關卡目標或經濟參數
   * 一旦改動到讓某關變得不可能，測試會直接指出是哪一關。
   */
  readonly recommendedParcels: number;
  /** 實測通關時的加工深度 */
  readonly recommendedDepth: 1 | 2;
  /** 實測通關時的開採廠數量 */
  readonly recommendedExtractors: number;
  readonly targets: StageTargets;
  /** 開場提示，給玩家一個方向 */
  readonly briefing: string;
}

/** 22 關。目標與資金都單調遞增，難度以「目標／資金」比決定。 */
export const STAGES: readonly StageDef[] = [
  {
    id: 'stage-01',
    index: 1,
    nameZh: '第一關 · 開張',
    eraLabel: '1950–1960',
    startingCash: 100000,
    maxDays: 12,
    difficulty: 1,
    recommendedParcels: 3,
    recommendedDepth: 1,
    recommendedExtractors: 1,
    targets: { netProfit: 1020000, craftedValue: 1028000, debtRepaid: 765000 },
    briefing: '先買一塊有礦脈的地、蓋一座工坊，把礦賣掉累積現金。',
  },
  {
    id: 'stage-02',
    index: 2,
    nameZh: '第二關 · 煉成',
    eraLabel: '1950–1960',
    startingCash: 104000,
    maxDays: 12,
    difficulty: 1,
    recommendedParcels: 3,
    recommendedDepth: 1,
    recommendedExtractors: 1,
    targets: { netProfit: 1025000, craftedValue: 1032000, debtRepaid: 769000 },
    briefing: '光賣原料不夠了。蓋第二座工坊，把原礦與樹脂壓成基礎零件。',
  },
  {
    id: 'stage-03',
    index: 3,
    nameZh: '第三關 · 通路',
    eraLabel: '1960–1970',
    startingCash: 108000,
    maxDays: 12,
    difficulty: 2,
    recommendedParcels: 3,
    recommendedDepth: 1,
    recommendedExtractors: 1,
    targets: { netProfit: 1030000, craftedValue: 1037000, debtRepaid: 772000 },
    briefing: '除了出貨給港區，開一間門市吃下城市消費需求。',
  },
  {
    id: 'stage-04',
    index: 4,
    nameZh: '第四關 · 擴廠',
    eraLabel: '1960–1970',
    startingCash: 111000,
    maxDays: 12,
    difficulty: 2,
    recommendedParcels: 3,
    recommendedDepth: 1,
    recommendedExtractors: 1,
    targets: { netProfit: 1034000, craftedValue: 1041000, debtRepaid: 776000 },
    briefing: '擴廠要吃材料。先把零件做出來，再蓋組裝廠往深加工走。',
  },
  {
    id: 'stage-05',
    index: 5,
    nameZh: '第五關 · 合金',
    eraLabel: '1970–1980',
    startingCash: 115000,
    maxDays: 12,
    difficulty: 2,
    recommendedParcels: 3,
    recommendedDepth: 1,
    recommendedExtractors: 1,
    targets: { netProfit: 1039000, craftedValue: 1046000, debtRepaid: 779000 },
    briefing: '組裝廠能把零件熔成合金板。留意短路程才划算。',
  },
  {
    id: 'stage-06',
    index: 6,
    nameZh: '第六關 · 借力',
    eraLabel: '1970–1980',
    startingCash: 119000,
    maxDays: 12,
    difficulty: 3,
    recommendedParcels: 3,
    recommendedDepth: 1,
    recommendedExtractors: 1,
    targets: { netProfit: 1043000, craftedValue: 1051000, debtRepaid: 782000 },
    briefing: '用貸款加速擴張，但記得在期限內把債還清 —— 那也是一條勝利路線。',
  },
  {
    id: 'stage-07',
    index: 7,
    nameZh: '第七關 · 手感',
    eraLabel: '1970–1980',
    startingCash: 123000,
    maxDays: 12,
    difficulty: 3,
    recommendedParcels: 4,
    recommendedDepth: 1,
    recommendedExtractors: 2,
    targets: { netProfit: 1484000, craftedValue: 1464000, debtRepaid: 1113000 },
    briefing: '雇技師與店員，員工在職越久越熟練，產能與覆蓋率都會上升。',
  },
  {
    id: 'stage-08',
    index: 8,
    nameZh: '第八關 · 品質',
    eraLabel: '1980–1990',
    startingCash: 127000,
    maxDays: 12,
    difficulty: 3,
    recommendedParcels: 4,
    recommendedDepth: 1,
    recommendedExtractors: 2,
    targets: { netProfit: 1491000, craftedValue: 1470000, debtRepaid: 1118000 },
    briefing: '研發能拉高品質檔位，但頂級品質還需要好的土壤與水質。',
  },
  {
    id: 'stage-09',
    index: 9,
    nameZh: '第九關 · 搶單',
    eraLabel: '1980–1990',
    startingCash: 130000,
    maxDays: 12,
    difficulty: 3,
    recommendedParcels: 4,
    recommendedDepth: 1,
    recommendedExtractors: 2,
    targets: { netProfit: 1497000, craftedValue: 1477000, debtRepaid: 1123000 },
    briefing: '城市合約要競標：出價壓過對手才接得到，出太低又會被底價擋下。',
  },
  {
    id: 'stage-10',
    index: 10,
    nameZh: '第十關 · 對抗',
    eraLabel: '1980–1990',
    startingCash: 134000,
    maxDays: 12,
    difficulty: 4,
    recommendedParcels: 4,
    recommendedDepth: 1,
    recommendedExtractors: 2,
    targets: { netProfit: 1504000, craftedValue: 1483000, debtRepaid: 1128000 },
    briefing: '市佔一高，對手就會加碼反制。擴張要留餘裕。',
  },
  {
    id: 'stage-11',
    index: 11,
    nameZh: '第十一關 · 多線',
    eraLabel: '1990–2000',
    startingCash: 138000,
    maxDays: 12,
    difficulty: 4,
    recommendedParcels: 6,
    recommendedDepth: 2,
    recommendedExtractors: 2,
    targets: { netProfit: 2535000, craftedValue: 2586000, debtRepaid: 1901000 },
    briefing: '多條產線同時跑，技師配比會決定吞吐。',
  },
  {
    id: 'stage-12',
    index: 12,
    nameZh: '第十二關 · 現金流',
    eraLabel: '1990–2000',
    startingCash: 142000,
    maxDays: 12,
    difficulty: 4,
    recommendedParcels: 6,
    recommendedDepth: 2,
    recommendedExtractors: 2,
    targets: { netProfit: 2546000, craftedValue: 2597000, debtRepaid: 1910000 },
    briefing: '留意土地稅與維護費，擴張過快會被固定成本吃光利潤。',
  },
  {
    id: 'stage-13',
    index: 13,
    nameZh: '第十三關 · 融資',
    eraLabel: '1990–2000',
    startingCash: 146000,
    maxDays: 12,
    difficulty: 4,
    recommendedParcels: 6,
    recommendedDepth: 2,
    recommendedExtractors: 2,
    targets: { netProfit: 2557000, craftedValue: 2608000, debtRepaid: 1918000 },
    briefing: '銀行週期會收利息。借得早不如借得巧。',
  },
  {
    id: 'stage-14',
    index: 14,
    nameZh: '第十四關 · 佈局',
    eraLabel: '2000–2010',
    startingCash: 150000,
    maxDays: 12,
    difficulty: 4,
    recommendedParcels: 6,
    recommendedDepth: 2,
    recommendedExtractors: 2,
    targets: { netProfit: 2568000, craftedValue: 2619000, debtRepaid: 1926000 },
    briefing: '距離越遠產出越低。把加工放在樞紐附近，原料放在礦脈上。',
  },
  {
    id: 'stage-15',
    index: 15,
    nameZh: '第十五關 · 規模',
    eraLabel: '2000–2010',
    startingCash: 153000,
    maxDays: 12,
    difficulty: 5,
    recommendedParcels: 6,
    recommendedDepth: 2,
    recommendedExtractors: 2,
    targets: { netProfit: 2579000, craftedValue: 2631000, debtRepaid: 1934000 },
    briefing: '六塊地以上才撐得起二階加工的供料。',
  },
  {
    id: 'stage-16',
    index: 16,
    nameZh: '第十六關 · 波動',
    eraLabel: '2000–2010',
    startingCash: 157000,
    maxDays: 12,
    difficulty: 5,
    recommendedParcels: 6,
    recommendedDepth: 2,
    recommendedExtractors: 2,
    targets: { netProfit: 2590000, craftedValue: 2642000, debtRepaid: 1942000 },
    briefing: '新聞事件會推高運費、壓低原料價。留一點緩衝。',
  },
  {
    id: 'stage-17',
    index: 17,
    nameZh: '第十七關 · 精算',
    eraLabel: '2010–2020',
    startingCash: 161000,
    maxDays: 12,
    difficulty: 5,
    recommendedParcels: 6,
    recommendedDepth: 2,
    recommendedExtractors: 2,
    targets: { netProfit: 2601000, craftedValue: 2653000, debtRepaid: 1950000 },
    briefing: '機械檔位差在週期與維護。近址才適合裝高效爐。',
  },
  {
    id: 'stage-18',
    index: 18,
    nameZh: '第十八關 · 議價',
    eraLabel: '2010–2020',
    startingCash: 165000,
    maxDays: 12,
    difficulty: 5,
    recommendedParcels: 8,
    recommendedDepth: 2,
    recommendedExtractors: 2,
    targets: { netProfit: 2849000, craftedValue: 2960000, debtRepaid: 2137000 },
    briefing: '門市定價越高，賣得越少。找需求彈性的甜蜜點。',
  },
  {
    id: 'stage-19',
    index: 19,
    nameZh: '第十九關 · 整合',
    eraLabel: '2010–2020',
    startingCash: 169000,
    maxDays: 12,
    difficulty: 5,
    recommendedParcels: 8,
    recommendedDepth: 2,
    recommendedExtractors: 2,
    targets: { netProfit: 2849000, craftedValue: 2960000, debtRepaid: 2137000 },
    briefing: '從礦到門市，一條龍的每一段都要賺。',
  },
  {
    id: 'stage-20',
    index: 20,
    nameZh: '第二十關 · 霸權',
    eraLabel: '2020–2030',
    startingCash: 172000,
    maxDays: 12,
    difficulty: 5,
    recommendedParcels: 8,
    recommendedDepth: 2,
    recommendedExtractors: 2,
    targets: { netProfit: 2849000, craftedValue: 2960000, debtRepaid: 2137000 },
    briefing: '吃下城市需求佔比，讓對手只能跟在你後面。',
  },
  {
    id: 'stage-21',
    index: 21,
    nameZh: '第二十一關 · 極限',
    eraLabel: '2020–2030',
    startingCash: 176000,
    maxDays: 12,
    difficulty: 5,
    recommendedParcels: 8,
    recommendedDepth: 2,
    recommendedExtractors: 2,
    targets: { netProfit: 3360000, craftedValue: 3397000, debtRepaid: 2520000 },
    briefing: '每一塊地都要有意義。稅金與維護不會等你。',
  },
  {
    id: 'stage-22',
    index: 22,
    nameZh: '第二十二關 · 產業王',
    eraLabel: '2020–2030',
    startingCash: 180000,
    maxDays: 12,
    difficulty: 5,
    recommendedParcels: 8,
    recommendedDepth: 2,
    recommendedExtractors: 2,
    targets: { netProfit: 3360000, craftedValue: 3397000, debtRepaid: 2520000 },
    briefing: '最終局。同時壓過獲利、工業化與還款三條線，才算真正的產業王。',
  },
];

export const FIRST_STAGE = STAGES[0]!;

export function stageById(id: string): StageDef | undefined {
  return STAGES.find((stage) => stage.id === id);
}

export function stageByIndex(index: number): StageDef | undefined {
  return STAGES.find((stage) => stage.index === index);
}

/** 下一關；最後一關之後回傳 undefined。 */
export function nextStage(currentId: string): StageDef | undefined {
  const current = stageById(currentId);
  if (!current) {
    return undefined;
  }
  return stageByIndex(current.index + 1);
}

/** 這一關是否已是最後一關。 */
export function isFinalStage(id: string): boolean {
  return stageById(id)?.index === STAGES.length;
}
