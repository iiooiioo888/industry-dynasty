import {
  applyWorldAction,
  createInitialWorld,
  type WorldAction,
  type WorldState,
} from '@industry-dynasty/sim';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { clearSave, loadGame, readSaveInfo, saveGame, type StoredSaveInfo } from './save-storage';

export interface SaveControls {
  /** 上次存檔摘要；沒有存檔時為 null */
  readonly info: StoredSaveInfo | null;
  readonly message: string | null;
  readonly save: () => void;
  readonly load: () => void;
  readonly reset: () => void;
}

export function useWorldState(): {
  state: WorldState;
  dispatch: (action: WorldAction) => void;
  saves: SaveControls;
} {
  const [state, setState] = useState(() => {
    // 開場先嘗試讀取存檔：玩到一半關掉瀏覽器不該全部重來。
    // 讀不到（沒有存檔／壞檔）就開新局，並在訊息列說明原因。
    const loaded = loadGame();
    return loaded.ok ? loaded.state : createInitialWorld();
  });
  const [info, setInfo] = useState<StoredSaveInfo | null>(() => readSaveInfo());
  const [message, setMessage] = useState<string | null>(() => {
    const loaded = loadGame();
    if (loaded.ok) {
      return loaded.warnings.length > 0 ? loaded.warnings.join('；') : null;
    }
    return null;
  });

  const dispatch = useCallback((action: WorldAction) => {
    setState((prev) => applyWorldAction(prev, action));
  }, []);

  const save = useCallback(() => {
    setState((current) => {
      const result = saveGame(current);
      setMessage(result.ok ? '已存檔' : (result.reason ?? '存檔失敗'));
      if (result.ok) {
        setInfo(readSaveInfo());
      }
      return current;
    });
  }, []);

  const load = useCallback(() => {
    const loaded = loadGame();
    if (!loaded.ok) {
      setMessage(loaded.reason);
      return;
    }
    setState(loaded.state);
    setInfo(readSaveInfo());
    setMessage(loaded.warnings.length > 0 ? loaded.warnings.join('；') : '已讀取存檔');
  }, []);

  const reset = useCallback(() => {
    clearSave();
    setState(createInitialWorld());
    setInfo(null);
    setMessage('已清除存檔並開新局');
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

  const saves = useMemo<SaveControls>(
    () => ({ info, message, save, load, reset }),
    [info, message, save, load, reset],
  );

  return useMemo(() => ({ state, dispatch, saves }), [state, dispatch, saves]);
}
