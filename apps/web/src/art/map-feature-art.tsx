import type { RoadPresentation } from '@industry-dynasty/sim';
import { ArtSlot } from './ArtSlot';

/**
 * 道路只用一張直線圖 `map-road`。
 * 東西向整格直貼，南北向轉 90°；轉角、T 字、十字不鋪整張，
 * 改把同一張圖的中央路帶裁成臂，只接到有路或城市的一側。
 */
export function RoadFeatureArt({ presentation }: { presentation: RoadPresentation }) {
  const { mode, rotation, arms } = presentation;
  return (
    <span className="road-tile" aria-hidden>
      {arms.map((dir) => (
        <span key={`stripe-${dir}`} className={`road-stripe arm-${dir}`} />
      ))}
      {mode === 'tile' ? (
        <ArtSlot slot="mapRoad" className={rotation === 90 ? 'road-rot-90' : undefined} />
      ) : (
        arms.map((dir) => (
          <span key={`arm-${dir}`} className={`road-clip arm-${dir}`}>
            <ArtSlot slot="mapRoad" />
          </span>
        ))
      )}
    </span>
  );
}
