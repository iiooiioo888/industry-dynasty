import { useEffect, useRef, useState } from 'react';
import './Motion.css';

/**
 * 數字變動時閃一下。
 *
 * 現金、淨利這類數字每秒都在跳，但玩家看不出「剛剛增加了」。
 * 用顏色方向提示增減，比一直盯著數字可靠。
 *
 * 尊重 `prefers-reduced-motion`：使用者要求減少動態時只換顏色、不做位移動畫。
 */
export interface AnimatedNumberProps {
  value: number;
  /** 顯示格式，預設加上千分位 */
  format?: (value: number) => string;
  className?: string;
}

export function AnimatedNumber({ value, format, className }: AnimatedNumberProps) {
  const previous = useRef(value);
  const [direction, setDirection] = useState<'up' | 'down' | null>(null);

  useEffect(() => {
    if (value === previous.current) {
      return;
    }
    const up = value > previous.current;
    previous.current = value;
    setDirection(up ? 'up' : 'down');
    const timer = window.setTimeout(() => setDirection(null), 620);
    return () => window.clearTimeout(timer);
  }, [value]);

  const text = (format ?? ((n: number) => Math.round(n).toLocaleString()))(value);
  return (
    <span
      className={['animated-number', direction ? `is-${direction}` : '', className ?? ''].join(' ')}
    >
      {text}
    </span>
  );
}
