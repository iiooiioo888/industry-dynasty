import type { RoadPresentation } from '@industry-dynasty/sim';
import { RoadFeatureArt } from '../art/map-feature-art';
import { ASSET_SLOTS, MAP_ART_SLOT } from '../assets/slots';
import type { CellFeatureArt } from '../map/map-feature-art';
import './MapFeatureSprites.css';

export interface MapCellFeatureArtProps {
  art: CellFeatureArt | undefined;
  /** 真實道路格的路口形態。有值時改畫轉角適配，不再鋪整張直線圖。 */
  road?: RoadPresentation | null;
}

/**
 * 單格地圖圖層。市場圖優先；其餘由下而上：人口密集、道路、城市建築、城市據點。
 */
export function MapCellFeatureArt({ art, road = null }: MapCellFeatureArtProps) {
  const visible =
    road != null ||
    art?.marketHub ||
    art?.popDense ||
    art?.road ||
    art?.cityBuilding ||
    art?.cityHub;
  if (!visible) {
    return null;
  }

  if (art?.marketHub) {
    return (
      <span className="map-art map-art-market-frame" aria-hidden="true">
        <img
          className="map-art-market"
          src={ASSET_SLOTS.ui.marketHub}
          alt=""
          width={64}
          height={64}
          draggable={false}
          decoding="async"
          data-art-slot={MAP_ART_SLOT.marketHub}
        />
      </span>
    );
  }

  return (
    <span className="map-art" aria-hidden="true">
      {art?.popDense && (
        <img
          className="map-art-pop"
          src={ASSET_SLOTS.map.popDense}
          alt=""
          width={64}
          height={64}
          draggable={false}
          decoding="async"
          data-art-slot={MAP_ART_SLOT.popDense}
        />
      )}
      {road ? (
        <RoadFeatureArt presentation={road} />
      ) : (
        art?.road && (
          <img
            className="map-art-road"
            src={ASSET_SLOTS.map.road}
            alt=""
            width={64}
            height={64}
            draggable={false}
            decoding="async"
            data-art-slot={MAP_ART_SLOT.road}
          />
        )
      )}
      {art?.cityBuilding && (
        <img
          className="map-art-building"
          src={ASSET_SLOTS.map.cityBuilding}
          alt=""
          width={64}
          height={64}
          draggable={false}
          decoding="async"
          data-art-slot={MAP_ART_SLOT.cityBuilding}
        />
      )}
      {art?.cityHub && (
        <img
          className="map-art-hub"
          src={ASSET_SLOTS.map.cityHub}
          alt=""
          width={64}
          height={64}
          draggable={false}
          decoding="async"
          data-art-slot={MAP_ART_SLOT.cityHub}
        />
      )}
    </span>
  );
}
