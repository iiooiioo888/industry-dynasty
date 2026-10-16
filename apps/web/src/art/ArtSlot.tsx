import { useState } from 'react';
import { ART_SLOTS, type ArtSlotKey } from './slots';

export function ArtSlot({ slot, className }: { slot: ArtSlotKey; className?: string }) {
  const spec = ART_SLOTS[slot];
  const [failed, setFailed] = useState(false);
  const classes = ['art-slot', failed ? 'art-missing' : '', className ?? '']
    .filter(Boolean)
    .join(' ');

  if (failed) {
    return <span className={classes} data-art-slot={spec.id} aria-hidden />;
  }

  return (
    <img
      className={classes}
      data-art-slot={spec.id}
      src={spec.src}
      alt=""
      onError={() => setFailed(true)}
    />
  );
}
