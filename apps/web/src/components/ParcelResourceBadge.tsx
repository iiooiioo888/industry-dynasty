import { PARCEL_RESOURCE_DEFS, type ParcelResource } from '@industry-dynasty/sim';
import type { CSSProperties } from 'react';
import './ParcelResourceBadge.css';

export interface ParcelResourceBadgeProps {
  resource: ParcelResource;
  variant?: 'compact' | 'prominent';
}

export function ParcelResourceBadge({ resource, variant = 'compact' }: ParcelResourceBadgeProps) {
  const def = PARCEL_RESOURCE_DEFS[resource.kind];
  const pct = Math.round((resource.reserves / resource.initialReserves) * 100);

  return (
    <div
      className={`parcel-resource-badge ${variant}`}
      style={{ '--res-hue': `${def.colorHue}` } as CSSProperties}
    >
      <span className="res-name">{resource.nameZh}</span>
      <span className="res-meta">
        品質 {resource.richness} · 儲量 {resource.reserves}/{resource.initialReserves}（{pct}%）
      </span>
      <span className="res-link">關聯原料：{resource.linkedItemId}</span>
    </div>
  );
}
