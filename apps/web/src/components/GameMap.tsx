import type { Parcel, ParcelId, WorldState } from '@industry-dynasty/sim';
import './GameMap.css';

export interface GameMapProps {
  state: WorldState;
  selectedParcelId: ParcelId | null;
  onSelectParcel: (parcelId: ParcelId) => void;
}

function cellClass(parcel: Parcel, isSelected: boolean, isLocalOwner: boolean): string {
  const classes = ['map-cell', 'interactive'];
  if (isSelected) {
    classes.push('selected');
  }
  if (parcel.state === 'building') {
    classes.push('under-construction');
  } else if (parcel.state === 'building-ready') {
    classes.push('building-ready');
  } else if (isLocalOwner) {
    classes.push('owned');
  } else if (parcel.ownerId) {
    classes.push('other-owned');
  } else {
    classes.push('empty');
  }
  return classes.join(' ');
}

export function GameMap({ state, selectedParcelId, onSelectParcel }: GameMapProps) {
  const { width, height } = state.map.size;
  const localId = state.localPlayerId;

  return (
    <section className="map-shell" aria-label="世界地圖">
      <div className="map-toolbar">
        <span>地圖 · 點選土地</span>
        <span className="map-dim">{width} × {height}</span>
      </div>
      <div
        className="map-grid"
        style={{ gridTemplateColumns: `repeat(${width}, minmax(0, 1fr))` }}
      >
        {state.map.parcels.map((parcel) => {
          const selected = selectedParcelId?.value === parcel.id.value;
          const isLocalOwner = parcel.ownerId === localId;
          return (
            <button
              key={parcel.id.value}
              type="button"
              className={cellClass(parcel, selected, isLocalOwner)}
              onClick={() => onSelectParcel(parcel.id)}
              title={`(${parcel.x}, ${parcel.y})`}
              aria-label={`土地 ${parcel.x}, ${parcel.y}`}
            />
          );
        })}
      </div>
      <div className="map-legend">
        <span><i className="swatch empty" /> 空地／拍賣中</span>
        <span><i className="swatch owned" /> 你的土地</span>
        <span><i className="swatch under-construction" /> 建造中</span>
        <span><i className="swatch building-ready" /> 工廠運營</span>
      </div>
    </section>
  );
}
