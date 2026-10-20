import {
  DEFAULT_WORLD_CONFIG,
  companyScore,
  enterFloorBlock,
  ticksUntilDayClose,
  type ConsumerItemId,
  type FactoryTypeId,
  type MachineGradeId,
  type MapLayer,
  type ParcelId,
  type RecipeId,
} from '@industry-dynasty/sim';
import { useEffect, useState } from 'react';
import { AuctionAlertBanner } from './components/AuctionAlertBanner';
import { BankPanel } from './components/BankPanel';
import { DataReportPanel } from './components/DataReportPanel';
import { GameMap } from './components/GameMap';
import { InventoryPanel } from './components/InventoryPanel';
import { MarketPanel } from './components/MarketPanel';
import { OperationsPanel } from './components/OperationsPanel';
import { ParcelPlanCard } from './components/ParcelPlanCard';
import { PnLPanel } from './components/PnLPanel';
import { PlayerOverview } from './components/PlayerOverview';
import { ProductionPanel } from './components/ProductionPanel';
import { SalesPanel } from './components/SalesPanel';
import { useWorldState } from './game/useWorldState';
import './App.css';

type RightTab = 'ops' | 'manage' | 'finance';

export function App() {
  const { state, dispatch } = useWorldState();
  const [selectedParcelId, setSelectedParcelId] = useState<ParcelId | null>(null);
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [reportOpen, setReportOpen] = useState(false);
  const [rightTab, setRightTab] = useState<RightTab>('ops');
  const [mapView, setMapView] = useState<MapLayer>('world');
  const clockLabel = state.clock.paused ? '暫停' : `${state.clock.speed}×`;
  const event = state.todayEvent;
  const floorBlock = selectedParcelId ? enterFloorBlock(state, selectedParcelId) : '先點一棟完工的建物';

  useEffect(() => {
    if (mapView === 'floor' && floorBlock) {
      setMapView('world');
    }
  }, [mapView, floorBlock]);

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
          第 {state.gameDay} 天 · {clockLabel} · 距日結 {ticksUntilDayClose(state.clock.simMs)} 刻 ·
          公司分數 {companyScore(state).toLocaleString()}
        </span>
        <p className="day-event">
          {event ? `${event.titleZh}。${event.detailZh}` : '平靜的一天。'}
        </p>
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
            mapView={mapView}
            onShowWorld={() => setMapView('world')}
            onShowFloor={() => {
              if (selectedParcelId && enterFloorBlock(state, selectedParcelId) === null) {
                setMapView('floor');
              }
            }}
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
            onSetShelfPrice={(parcelId, itemId: ConsumerItemId, unitPrice) =>
              dispatch({ type: 'SET_SHELF_PRICE', parcelId, itemId, unitPrice })
            }
            onEnterFloor={() => setMapView('floor')}
          />
        </main>
        <aside className="shell-col shell-col-right">
          <div className="right-tabs" role="tablist" aria-label="右側面板">
            {(
              [
                ['ops', '產銷'],
                ['manage', '經營'],
                ['finance', '資金'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={rightTab === id}
                onClick={() => setRightTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
          {rightTab === 'ops' ? (
            <>
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
              <SalesPanel
                state={state}
                selectedParcelId={selectedParcelId}
                onSell={(offerId, quantity, shipFromParcelId) =>
                  dispatch({ type: 'SELL_TO_NPC', offerId, quantity, shipFromParcelId })
                }
              />
            </>
          ) : null}
          {rightTab === 'manage' ? (
            <OperationsPanel
              state={state}
              onHire={(candidateId) => dispatch({ type: 'HIRE_STAFF', candidateId })}
              onDismiss={(staffId) => dispatch({ type: 'DISMISS_STAFF', staffId })}
              onAssign={(staffId, parcelId) =>
                dispatch({ type: 'ASSIGN_STAFF', staffId, parcelId })
              }
              onUnlock={(projectId) => dispatch({ type: 'UNLOCK_RESEARCH', projectId })}
              onSetPrice={(parcelId, itemId, unitPrice) =>
                dispatch({ type: 'SET_SHELF_PRICE', parcelId, itemId, unitPrice })
              }
              onBuyAd={(spend) => dispatch({ type: 'BUY_ADVERT', spend })}
            />
          ) : null}
          {rightTab === 'finance' ? (
            <BankPanel
              state={state}
              onOpenSavings={(amount) => dispatch({ type: 'OPEN_SAVINGS', amount })}
              onWithdrawSavings={() => dispatch({ type: 'WITHDRAW_SAVINGS' })}
              onDrawLoan={(productId, amount) =>
                dispatch({ type: 'DRAW_LOAN', productId, amount })
              }
              onRepayLoan={(loanId, amount) => dispatch({ type: 'REPAY_LOAN', loanId, amount })}
              onBuyStock={(symbol, shares) => dispatch({ type: 'BUY_STOCK', symbol, shares })}
              onSellStock={(symbol, shares) => dispatch({ type: 'SELL_STOCK', symbol, shares })}
              onBuyCommodity={(commodityId, lots) =>
                dispatch({ type: 'BUY_COMMODITY', commodityId, lots })
              }
              onSellCommodity={(commodityId, lots) =>
                dispatch({ type: 'SELL_COMMODITY', commodityId, lots })
              }
              onWithdrawCommodity={(commodityId, lots) =>
                dispatch({ type: 'WITHDRAW_COMMODITY', commodityId, lots })
              }
            />
          ) : null}
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
