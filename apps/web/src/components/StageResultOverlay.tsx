import {
  diagnoseLoss,
  isFinalStage,
  nextStage,
  stageById,
  type ScenarioProgress,
  type ScenarioState,
  type StageDef,
  type WorldState,
} from '@industry-dynasty/sim';
import { useMemo } from 'react';
import './StageResultOverlay.css';

export interface StageResultOverlayProps {
  state: WorldState;
  scenario: ScenarioState;
  progress: ScenarioProgress;
  onNextStage: (stage: StageDef) => void;
  onReplay: () => void;
}

/**
 * 關卡結算畫面。
 *
 * 通關或失敗時蓋在畫面上，顯示三條勝利路線各自的達成狀況，
 * 並提供「下一關」（最後一關則顯示完成全部關卡）與「重玩本關」。
 *
 * 失敗時會多一段**敗因診斷**（見 `guidance/diagnosis.ts`）——
 * 原本只寫「時間到，未達標」，玩家不知道自己做錯了什麼。
 */
export function StageResultOverlay({
  state,
  scenario,
  progress,
  onNextStage,
  onReplay,
}: StageResultOverlayProps) {
  const diagnoses = useMemo(
    () =>
      scenario.status === 'lost'
        ? diagnoseLoss({
            state,
            scenario,
            context: {
              craftedValue: progress.craftedValue,
              commerce: progress.commerce,
              debtRepaid: progress.debtRepaid,
              outstandingDebt: progress.outstandingDebt,
            },
          })
        : [],
    [scenario, state, progress],
  );

  if (scenario.status === 'playing') {
    return null;
  }
  const stage = stageById(scenario.config.stageId ?? '') ?? null;
  const won = scenario.status === 'won';
  const upcoming = stage ? nextStage(stage.id) : undefined;
  const final = stage ? isFinalStage(stage.id) : false;

  return (
    <div className="stage-overlay" role="dialog" aria-modal="true">
      <div className={`stage-card ${won ? 'is-won' : 'is-lost'}`}>
        <header>
          <h2>{won ? '關卡達成' : '時間到，未達標'}</h2>
          <p className="stage-sub">{stage ? `${stage.nameZh}｜${stage.eraLabel}` : '自由模式'}</p>
        </header>

        <ul className="stage-routes">
          <li className={progress.profitMet ? 'ok' : 'no'}>
            <span>淨利</span>
            <strong>
              {Math.round(progress.netProfit).toLocaleString()} /{' '}
              {scenario.config.targetNetProfit.toLocaleString()}
            </strong>
          </li>
          <li className={progress.craftedMet ? 'ok' : 'no'}>
            <span>加工產值</span>
            <strong>
              {Math.round(progress.craftedValue).toLocaleString()} /{' '}
              {scenario.config.targetCraftedValue.toLocaleString()}
            </strong>
          </li>
          <li className={progress.repaidMet && progress.debtClear ? 'ok' : 'no'}>
            <span>清償貸款</span>
            <strong>
              {Math.round(progress.debtRepaid).toLocaleString()} /{' '}
              {scenario.config.targetDebtRepaid.toLocaleString()}
              {progress.debtClear ? '' : '（仍有負債）'}
            </strong>
          </li>
          <li className={progress.shareMet ? 'ok' : 'no'}>
            <span>城市需求佔比</span>
            <strong>
              {(progress.commerce.share * 100).toFixed(1)}% /{' '}
              {((scenario.config.targetShare ?? 0) * 100).toFixed(0)}%
            </strong>
          </li>
        </ul>

        {!won && diagnoses.length > 0 && (
          <div className="stage-diagnosis">
            <h3>為什麼沒達標</h3>
            <ul>
              {diagnoses.slice(0, 4).map((reason) => (
                <li key={reason.id}>
                  <strong>{reason.headline}</strong>
                  <span>{reason.hint}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="stage-hint">
          {won
            ? final
              ? '全部關卡完成 —— 你是產業王。'
              : `下一關：${upcoming?.nameZh ?? ''}｜${upcoming?.eraLabel ?? ''}`
            : '重整配置再試一次：先確認供料，再擴廠。'}
        </p>

        <div className="stage-actions">
          {won && upcoming && (
            <button type="button" className="primary" onClick={() => onNextStage(upcoming)}>
              進入下一關
            </button>
          )}
          {won && final && (
            <button type="button" className="primary" onClick={() => onReplay()}>
              再玩一次
            </button>
          )}
          <button type="button" onClick={() => onReplay()}>
            {won ? '重玩本關' : '重新開始'}
          </button>
        </div>
      </div>
    </div>
  );
}
