import {
  SIM_PACKAGE_VERSION,
  type FactoryTypeId,
  type ParcelId,
  type RecipeId,
} from '@industry-dynasty/sim';
import { useState } from 'react';
import { AuctionAlertBanner } from './components/AuctionAlertBanner';
import { AuctionPanel } from './components/AuctionPanel';
import { BuildPanel } from './components/BuildPanel';
import { GameMap } from './components/GameMap';
import { InventoryPanel } from './components/InventoryPanel';
import { PnLPanel } from './components/PnLPanel';
import { PlayerOverview } from './components/PlayerOverview';
import { ProductionPanel } from './components/ProductionPanel';
import { SalesPanel } from './components/SalesPanel';
import { useWorldState } from './game/useWorldState';
import './App.css';

export function App() {
  const { state, dispatch } = useWorldState();
  const [selectedParcelId, setSelectedParcelId] = useState<ParcelId | null>(null);

  return (
    <div className="shell">
      <header className="shell-titlebar">
        <span className="brand">產業霸權 · 產業控制台</span>
        <span className="meta">
          {SIM_PACKAGE_VERSION} · 第 {state.gameDay} 天 · 稅務 T{state.taxTick} · 生產 P
          {state.productionTick}
        </span>
      </header>
      <AuctionAlertBanner state={state} selectedParcelId={selectedParcelId} />
      <div className="shell-body">
        <aside className="shell-col shell-col-left">
          <PnLPanel state={state} />
          <PlayerOverview
            state={state}
            onAdvanceTax={() => dispatch({ type: 'ADVANCE_DAY' })}
          />
          <InventoryPanel state={state} />
        </aside>
        <main className="shell-col shell-col-center">
          <GameMap
            state={state}
            selectedParcelId={selectedParcelId}
            onSelectParcel={setSelectedParcelId}
          />
        </main>
        <aside className="shell-col shell-col-right">
          <ProductionPanel
            state={state}
            selectedParcelId={selectedParcelId}
            onStart={(parcelId, recipeId: RecipeId) =>
              dispatch({ type: 'START_PRODUCTION', parcelId, recipeId })
            }
            onStop={(parcelId) => dispatch({ type: 'STOP_PRODUCTION', parcelId })}
            onAdvanceProduction={() => dispatch({ type: 'ADVANCE_PRODUCTION_TICK' })}
            onDemolish={(parcelId) => dispatch({ type: 'DEMOLISH', parcelId })}
          />
          <BuildPanel
            state={state}
            selectedParcelId={selectedParcelId}
            onStartBuild={(parcelId, factoryTypeId: FactoryTypeId) =>
              dispatch({ type: 'START_BUILD', parcelId, factoryTypeId })
            }
            onAdvanceBuild={() => dispatch({ type: 'ADVANCE_BUILD_TICK' })}
            onCancelBuild={(parcelId) => dispatch({ type: 'CANCEL_BUILD', parcelId })}
            onDemolish={(parcelId) => dispatch({ type: 'DEMOLISH', parcelId })}
          />
          <SalesPanel
            state={state}
            selectedParcelId={selectedParcelId}
            onSell={(offerId, quantity, shipFromParcelId) =>
              dispatch({ type: 'SELL_TO_NPC', offerId, quantity, shipFromParcelId })
            }
          />
          <AuctionPanel
            state={state}
            selectedParcelId={selectedParcelId}
            onBid={(parcelId, amount) => dispatch({ type: 'BID', parcelId, amount })}
            onSettle={(parcelId) => dispatch({ type: 'SETTLE_AUCTION', parcelId })}
          />
        </aside>
      </div>
    </div>
  );
}
