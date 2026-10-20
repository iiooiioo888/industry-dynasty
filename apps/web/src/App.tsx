import {
  DEFAULT_WORLD_CONFIG,
  marketShareOf,
  readCommerce,
  ticksUntilDayClose,
  type FactoryTypeId,
  type ItemId,
  type MachineGradeId,
  type ParcelId,
  type RecipeId,
  type StaffRole,
} from '@industry-dynasty/sim';
import { useState } from 'react';
import { AuctionAlertBanner } from './components/AuctionAlertBanner';
import { MarketNewsBanner } from './components/MarketNewsBanner';
import { BankPanel } from './components/BankPanel';
import { DataReportPanel } from './components/DataReportPanel';
import { GameMap } from './components/GameMap';
import { InventoryPanel } from './components/InventoryPanel';
import { MarketPanel } from './components/MarketPanel';
import { ParcelPlanCard } from './components/ParcelPlanCard';
import { PnLPanel } from './components/PnLPanel';
import { PlayerOverview } from './components/PlayerOverview';
import { OpsPanel } from './components/OpsPanel';
import { ProductionPanel } from './components/ProductionPanel';
import { SalesPanel } from './components/SalesPanel';
import { useWorldState } from './game/useWorldState';
import './App.css';

const PAGES = [
  ['map', '地圖'],
  ['produce', '生產'],
  ['market', '市場'],
  ['sales', '銷售'],
  ['ops', '經營'],
  ['bank', '銀行'],
  ['books', '帳冊'],
] as const;

type PageId = (typeof PAGES)[number][0];

export function App() {
  const { state, dispatch } = useWorldState();
  const [selectedParcelId, setSelectedParcelId] = useState<ParcelId | null>(null);
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [reportOpen, setReportOpen] = useState(false);
  const [page, setPage] = useState<PageId>('map');
  const clockLabel = state.clock.paused ? '暫停' : `${state.clock.speed}×`;
  const sharePct = Math.round(marketShareOf(readCommerce(state)) * 100);
  const cash = state.players[state.localPlayerId]?.cash ?? 0;

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
        <span className="meta" data-clock-readout="true">
          第 {state.gameDay} 天 · {clockLabel} · 距日結 {ticksUntilDayClose(state.clock.simMs)} 刻 · 市佔 {sharePct}% · $
          {cash.toLocaleString()}
        </span>
      </header>
      <nav className="shell-nav" aria-label="頁面">
        {PAGES.map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={page === id ? 'is-on' : undefined}
            aria-current={page === id ? 'page' : undefined}
            onClick={() => setPage(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      <AuctionAlertBanner state={state} selectedParcelId={selectedParcelId} />
      <MarketNewsBanner state={state} />
      {page === 'map' ? (
      <div className="shell-body">
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
      </div>
      ) : (
        <div className="page-sheet">
          {page === 'produce' ? (
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
          ) : null}
          {page === 'market' ? <MarketPanel state={state} selectedParcelId={selectedParcelId} /> : null}
          {page === 'sales' ? (
            <SalesPanel
              state={state}
              selectedParcelId={selectedParcelId}
              onSell={(offerId, quantity, shipFromParcelId) =>
                dispatch({ type: 'SELL_TO_NPC', offerId, quantity, shipFromParcelId })
              }
              onSetShelf={(parcelId, itemId: ItemId, unitPrice, quantity) =>
                dispatch({ type: 'SET_SHELF', parcelId, itemId, unitPrice, quantity })
              }
              onAcceptContract={(contractId, shipFromParcelId) =>
                dispatch({ type: 'ACCEPT_CONTRACT', contractId, shipFromParcelId })
              }
            />
          ) : null}
          {page === 'ops' ? (
            <OpsPanel
              state={state}
              onHire={(role: StaffRole, count) => dispatch({ type: 'HIRE_STAFF', role, count })}
              onFire={(role: StaffRole, count) => dispatch({ type: 'FIRE_STAFF', role, count })}
              onResearch={(parcelId) => dispatch({ type: 'START_RESEARCH', parcelId })}
              onCampaign={(cityId) => dispatch({ type: 'BUY_CAMPAIGN', cityId })}
            />
          ) : null}
          {page === 'bank' ? (
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
          ) : null}
          {page === 'books' ? (
            <>
              <PnLPanel state={state} />
              <PlayerOverview state={state} />
              <InventoryPanel state={state} />
              <button type="button" className="report-launch" onClick={() => setReportOpen(true)}>
                數據報表
              </button>
            </>
          ) : null}
        </div>
      )}
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
