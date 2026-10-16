import { SIM_PACKAGE_VERSION } from '@industry-dynasty/sim';
import { MapPlaceholder } from './components/MapPlaceholder';
import './App.css';

export function App() {
  return (
    <div className="app">
      <header className="app-header">
        <h1 className="title">產業霸權</h1>
        <p className="subtitle">Industry Dynasty</p>
        <p className="tagline">空間效率 × 時間規劃 = 利潤</p>
        <p className="meta">sim {SIM_PACKAGE_VERSION} · Sprint 0</p>
      </header>
      <main className="app-main">
        <MapPlaceholder columns={16} rows={12} />
      </main>
    </div>
  );
}
