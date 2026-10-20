import {
  applyWorldAction,
  createInitialWorld,
  cueForAction,
  cueForBuildCompletion,
  stageWorldConfig,
  type WorldAction,
  type WorldState,
} from '@industry-dynasty/sim';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { isMuted, playCue, toggleMuted } from '../audio/player';
import { clearSave, loadGame, readSaveInfo, saveGame, type StoredSaveInfo } from './save-storage';

export interface SaveControls {
  /** 上次存檔摘要；沒有存檔時為 null */
  readonly info: StoredSaveInfo | null;
  readonly message: string | null;
  readonly save: () => void;
  readonly load: () => void;
  readonly reset: () => void;
}

export interface SoundControls {
  readonly muted: boolean;
  readonly toggleMute: () => void;
}

export function useWorldState(): {
  state: WorldState;
  dispatch: (action: WorldAction) => void;
  saves: SaveControls;
  sound: SoundControls;
  /** 以指定關卡開新局（跨局推進用） */
  startStage: (stageId: string) => void;
} {
  const [state, setState] = useState(() => {
    // 開場先嘗試讀取存檔：玩到一半關掉瀏覽器不該全部重來。
    // 讀不到（沒有存檔／壞檔）就開新局，並在訊息列說明原因。
    const loaded = loadGame();
    return loaded.ok ? loaded.state : createInitialWorld();
  });
  // 用 ref 保存「最新狀態」，讓 dispatch 能算出動作前後的差異來決定音效。
  // 不在 setState 的 updater 裡播聲音 —— StrictMode 會重複呼叫 updater，
  // 那樣同一個動作會響兩次。
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  const [info, setInfo] = useState<StoredSaveInfo | null>(() => readSaveInfo());
  const [message, setMessage] = useState<string | null>(() => {
    const loaded = loadGame();
    if (loaded.ok) {
      return loaded.warnings.length > 0 ? loaded.warnings.join('；') : null;
    }
    return null;
  });
  const [muted, setMutedState] = useState(() => isMuted());

  const dispatch = useCallback((action: WorldAction) => {
    const before = stateRef.current;
    const after = applyWorldAction(before, action);
    stateRef.current = after;
    setState(after);
    // 建造完工比一般動作更值得通知，優先播它
    const cue = cueForBuildCompletion(before, after) ?? cueForAction(action, before, after);
    if (cue) {
      playCue(cue);
    }
  }, []);

  const sound = useMemo<SoundControls>(
    () => ({
      muted,
      toggleMute: () => {
        setMutedState(toggleMuted());
      },
    }),
    [muted],
  );

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

  // 跨局推進：以關卡表裡的起始資金與目標重開一局
  const startStage = useCallback((stageId: string) => {
    clearSave();
    setState(createInitialWorld(stageWorldConfig(stageId)));
    setInfo(null);
    setMessage('已進入下一關');
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

  return useMemo(
    () => ({ state, dispatch, saves, sound, startStage }),
    [state, dispatch, saves, sound, startStage],
  );
}
