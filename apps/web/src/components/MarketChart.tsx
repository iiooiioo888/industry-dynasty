import { useEffect, useRef } from 'react';
import {
  AreaSeries,
  ColorType,
  HistogramSeries,
  createChart,
  type Time,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { ChartPoint } from '@industry-dynasty/sim';

const RISE = '#ff7b72';
const FALL = '#3dd68c';
const FLAT = '#9aa0ab';

function tickTime(tick: number): UTCTimestamp {
  return (tick * 86_400) as UTCTimestamp;
}

function formatTick(time: Time): string {
  if (typeof time !== 'number') {
    return '';
  }
  return `第 ${Math.round(time / 86_400)} 期`;
}

function toneColor(delta: number): string {
  if (delta > 0) {
    return RISE;
  }
  if (delta < 0) {
    return FALL;
  }
  return FLAT;
}

export function MarketChart({
  name,
  code,
  points,
  delta,
}: {
  name: string;
  code: string;
  points: readonly ChartPoint[];
  delta: number;
}) {
  const host = useRef<HTMLDivElement>(null);
  const color = toneColor(delta);
  const last = points[points.length - 1];
  const pointsRef = useRef(points);
  pointsRef.current = points;
  const signature = `${code}|${color}|${points.map((point) => `${point.tick}:${point.value}:${point.volume}`).join(',')}`;

  useEffect(() => {
    const el = host.current;
    const points = pointsRef.current;
    if (!el) {
      return;
    }
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#9aa0ab',
        fontFamily: "'Noto Sans TC', sans-serif",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.05)' },
        horzLines: { color: 'rgba(255,255,255,0.05)' },
      },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.08)' },
      timeScale: {
        borderColor: 'rgba(255,255,255,0.08)',
        timeVisible: false,
        secondsVisible: false,
        tickMarkFormatter: formatTick,
        fixLeftEdge: true,
        fixRightEdge: true,
      },
      localization: {
        locale: 'zh-Hant',
        timeFormatter: formatTick,
      },
      crosshair: {
        vertLine: { color: 'rgba(243,244,246,0.28)', labelBackgroundColor: '#1e2128' },
        horzLine: { color: 'rgba(243,244,246,0.28)', labelBackgroundColor: '#1e2128' },
      },
      handleScroll: false,
      handleScale: false,
    });
    const area = chart.addSeries(AreaSeries, {
      lineColor: color,
      topColor: `${color}59`,
      bottomColor: `${color}08`,
      lineWidth: 2,
      priceLineVisible: true,
      lastValueVisible: true,
      priceFormat: { type: 'price', precision: 0, minMove: 1 },
    });
    const volume = chart.addSeries(HistogramSeries, {
      priceScaleId: 'volume',
      priceFormat: { type: 'volume' },
      priceLineVisible: false,
      lastValueVisible: false,
    });
    chart.priceScale('right').applyOptions({ scaleMargins: { top: 0.08, bottom: 0.28 } });
    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.74, bottom: 0 },
      visible: false,
    });
    area.setData(points.map((point) => ({ time: tickTime(point.tick), value: point.value })));
    volume.setData(
      points.map((point, index) => {
        const previous = index === 0 ? point.value : points[index - 1]!.value;
        const bar =
          point.value > previous
            ? 'rgba(255,123,114,0.45)'
            : point.value < previous
              ? 'rgba(61,214,140,0.4)'
              : 'rgba(154,160,171,0.28)';
        return { time: tickTime(point.tick), value: point.volume, color: bar };
      }),
    );
    chart.timeScale().fitContent();
    return () => {
      chart.remove();
    };
  }, [signature]);

  return (
    <figure className="market-chart" data-chart-name={name} data-chart-points={points.length}>
      <figcaption className="market-chart-head">
        <strong>{name}</strong>
        <span className="market-chart-code">{code}</span>
        <b className={delta > 0 ? 'quote-rise price' : delta < 0 ? 'quote-fall price' : 'price'}>
          {last ? last.value.toLocaleString() : '—'}
        </b>
        <span className={delta > 0 ? 'quote-rise' : delta < 0 ? 'quote-fall' : undefined}>
          {delta > 0 ? '▲' : delta < 0 ? '▼' : '–'} {Math.abs(delta)}
        </span>
        <span className="market-chart-tick">{last ? `第 ${last.tick} 期` : ''}</span>
      </figcaption>
      <div ref={host} className="market-chart-canvas" />
    </figure>
  );
}
