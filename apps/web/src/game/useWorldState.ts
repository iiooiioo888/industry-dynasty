import {
  applyWorldAction,
  createInitialWorld,
  type WorldAction,
  type WorldState,
} from '@industry-dynasty/sim';
import { useCallback, useMemo, useState } from 'react';

export function useWorldState(): {
  state: WorldState;
  dispatch: (action: WorldAction) => void;
} {
  const [state, setState] = useState(() => createInitialWorld());

  const dispatch = useCallback((action: WorldAction) => {
    setState((prev) => applyWorldAction(prev, action));
  }, []);

  return useMemo(() => ({ state, dispatch }), [state, dispatch]);
}
