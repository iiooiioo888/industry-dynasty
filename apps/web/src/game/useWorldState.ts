import {
  applyWorldAction,
  createInitialWorld,
  type WorldAction,
  type WorldState,
} from '@industry-dynasty/sim';
import { useCallback, useEffect, useMemo, useState } from 'react';

export function useWorldState(): {
  state: WorldState;
  dispatch: (action: WorldAction) => void;
} {
  const [state, setState] = useState(() => createInitialWorld());

  const dispatch = useCallback((action: WorldAction) => {
    setState((prev) => applyWorldAction(prev, action));
  }, []);

  useEffect(() => {
    let frame = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const delta = now - last;
      last = now;
      if (delta > 0) {
        dispatch({ type: 'ADVANCE_SIM_TIME', deltaMs: delta });
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [dispatch]);

  return useMemo(() => ({ state, dispatch }), [state, dispatch]);
}
