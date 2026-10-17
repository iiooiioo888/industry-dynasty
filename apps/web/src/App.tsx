import {
  DEFAULT_WORLD_CONFIG,
  ticksUntilDayClose,
  type FactoryTypeId,
  type MachineGradeId,
  type ParcelId,
  type RecipeId,
} from '@industry-dynasty/sim';
import { useState } from 'react';
import { AuctionAlertBanner } from './components/AuctionAlertBanner';
import { BankPanel } from './components/BankPanel';
import { DataReportPanel } from './components/DataReportPanel';
import { GameMap } from './components/GameMap';
import { InventoryPanel } from './components/InventoryPanel';
import { MarketPanel } from './components/MarketPanel';
import { ParcelPlanCard } from './components/ParcelPlanCard';
import { PnLPanel } from './components/PnLPanel';
import { PlayerOverview } from './components/PlayerOverview';
import { ProductionPanel } from './components/ProductionPanel';
import { SalesPanel } from './components/SalesPanel';
import { useWorldState } from './game/useWorldState';
import './App.css';

export function App() {
  const { state, dispatch } = useWorldState();
  const [selectedParcelId, setSelectedParcelId] = useState<ParcelId | null>(null);
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [reportOpen, setReportOpen] = useState(false);
  const clockLabel = state.clock.paused ? '暫停' : `${state.clock.speed}×`;

  function togglePin(parcelId: ParcelId) {
    setPinnedIds((current) => {
      if (current.includes(parcelId.value)) {
        return current.filter((id) => id !== parcelId.value);
      }
      return [...current, parcelId.value].slice(-3);
    });
  }

  return (
    <div className="shell">
      <header className="shell-titlebar">
        <span className="brand">產業霸權 · 產業控制台</span>
        <button type="button" className="report-launch" onClick={() => setReportOpen(true)}>
          數據報表
        </button>
        <span className="meta" data-clock-readout="true">
          第 {state.gameDay} 天 · {clockLabel} · 距日結 {ticksUntilDayClose(state.clock.simMs)} 刻
        </span>
      </header>
      <AuctionAlertBanner state={state} selectedParcelId={selectedParcelId} />
      <div className="shell-body">
        <aside className="shell-col shell-col-left">
          <PnLPanel state={state} />
          <PlayerOverview state={state} />
          <InventoryPanel state={state} />
        </aside>
        <main className="shell-col shell-col-center">
          <GameMap
            state={state}
            selectedParcelId={selectedParcelId}
            onSelectParcel={setSelectedParcelId}
            onTogglePause={() => dispatch({ type: 'SET_CLOCK', paused: !state.clock.paused })}
            onSetSpeed={(speed) => dispatch({ type: 'SET_CLOCK', paused: false, speed })}
          />
          <ParcelPlanCard
            state={state}
            selectedParcelId={selectedParcelId}
            pinnedIds={pinnedIds}
            onTogglePin={togglePin}
            onBid={(parcelId, amount) => dispatch({ type: 'BID', parcelId, amount })}
            onSettle={(parcelId) => dispatch({ type: 'SETTLE_AUCTION', parcelId })}
            onStartBuild={(parcelId, factoryTypeId: FactoryTypeId) =>
              dispatch({ type: 'START_BUILD', parcelId, factoryTypeId })
            }
            onCancelBuild={(parcelId) => dispatch({ type: 'CANCEL_BUILD', parcelId })}
            onStartProduction={(parcelId, recipeId: RecipeId, machineGradeId?: MachineGradeId) =>
              dispatch({ type: 'START_PRODUCTION', parcelId, recipeId, machineGradeId })
            }
            onInstallMachine={(parcelId, machineGradeId: MachineGradeId) =>
              dispatch({ type: 'INSTALL_MACHINE', parcelId, machineGradeId })
            }
            onStopProduction={(parcelId) => dispatch({ type: 'STOP_PRODUCTION', parcelId })}
          />
        </main>
        <aside className="shell-col shell-col-right">
          <ProductionPanel
            state={state}
            selectedParcelId={selectedParcelId}
            onStop={(parcelId) => dispatch({ type: 'STOP_PRODUCTION', parcelId })}
            onInstallMachine={(parcelId, machineGradeId: MachineGradeId) =>
              dispatch({ type: 'INSTALL_MACHINE', parcelId, machineGradeId })
            }
            onAdvanceProduction={() => dispatch({ type: 'ADVANCE_PRODUCTION_TICK' })}
            onDemolish={(parcelId) => dispatch({ type: 'DEMOLISH', parcelId })}
          />
          <MarketPanel state={state} selectedParcelId={selectedParcelId} />
          <BankPanel
            state={state}
            onOpenSavings={(amount) => dispatch({ type: 'OPEN_SAVINGS', amount })}
            onWithdrawSavings={() => dispatch({ type: 'WITHDRAW_SAVINGS' })}
            onDrawLoan={(productId, amount) => dispatch({ type: 'DRAW_LOAN', productId, amount })}
            onRepayLoan={(loanId, amount) => dispatch({ type: 'REPAY_LOAN', loanId, amount })}
            onBuyStock={(symbol, shares) => dispatch({ type: 'BUY_STOCK', symbol, shares })}
            onSellStock={(symbol, shares) => dispatch({ type: 'SELL_STOCK', symbol, shares })}
            onBuyCommodity={(commodityId, lots) =>
              dispatch({ type: 'BUY_COMMODITY', commodityId, lots })
            }
            onSellCommodity={(commodityId, lots) =>
              dispatch({ type: 'SELL_COMMODITY', commodityId, lots })
            }
          />
          <SalesPanel
            state={state}
            selectedParcelId={selectedParcelId}
            onSell={(offerId, quantity, shipFromParcelId) =>
              dispatch({ type: 'SELL_TO_NPC', offerId, quantity, shipFromParcelId })
            }
          />
        </aside>
      </div>
      {reportOpen ? (
        <DataReportPanel
          onClose={() => setReportOpen(false)}
          mapWidth={state.map.size.width}
          mapHeight={state.map.size.height}
          startingCash={DEFAULT_WORLD_CONFIG.startingCash}
        />
      ) : null}
    </div>
  );
}
