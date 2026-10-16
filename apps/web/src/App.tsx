import { SIM_PACKAGE_VERSION, type ParcelId } from '@industry-dynasty/sim';
import { useState } from 'react';
import { AuctionPanel } from './components/AuctionPanel';
import { GameMap } from './components/GameMap';
import { PlayerOverview } from './components/PlayerOverview';
import { useWorldState } from './game/useWorldState';
import './App.css';

export function App() {
  const { state, dispatch } = useWorldState();
  const [selectedParcelId, setSelectedParcelId] = useState<ParcelId | null>(null);

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="title">產業霸權</h1>
        <p className="subtitle">Industry Dynasty</p>
        <p className="tagline">空間效率 × 時間規劃 = 利潤</p>
        <p className="meta">sim {SIM_PACKAGE_VERSION} · Sprint 1｜世界與買地</p>
      </header>
      <main className="app-layout">
        <div className="app-map">
          <GameMap
            state={state}
            selectedParcelId={selectedParcelId}
            onSelectParcel={setSelectedParcelId}
          />
        </div>
        <aside className="app-sidebar">
          <PlayerOverview
            state={state}
            onAdvanceTax={() => dispatch({ type: 'ADVANCE_TAX_TICK' })}
          />
          <AuctionPanel
            state={state}
            selectedParcelId={selectedParcelId}
            onBid={(parcelId, amount) => dispatch({ type: 'BID', parcelId, amount })}
            onSettle={(parcelId) => dispatch({ type: 'SETTLE_AUCTION', parcelId })}
          />
        </aside>
      </main>
    </div>
  );
}
