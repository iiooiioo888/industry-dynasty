import './MapPlaceholder.css';

export interface MapPlaceholderProps {
  columns: number;
  rows: number;
}

export function MapPlaceholder({ columns, rows }: MapPlaceholderProps) {
  const cells = Array.from({ length: columns * rows }, (_, i) => i);

  return (
    <section className="map-shell" aria-label="地圖占位">
      <div className="map-toolbar">
        <span>地圖 · Map</span>
        <span className="map-dim">{columns} × {rows}</span>
      </div>
      <div
        className="map-grid"
        style={{
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        }}
      >
        {cells.map((cell) => (
          <div key={cell} className="map-cell" />
        ))}
      </div>
      <p className="map-hint">拍賣、建造與物流將在此呈現（Sprint 0 占位）</p>
    </section>
  );
}
