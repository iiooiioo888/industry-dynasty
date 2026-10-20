import { readCommerce, type WorldState } from '@industry-dynasty/sim';
import './MarketNewsBanner.css';

export function MarketNewsBanner({ state }: { state: WorldState }) {
  const events = readCommerce(state).events;
  if (events.length === 0) {
    return null;
  }

  return (
    <div className="market-news-banner" role="status" aria-live="polite">
      {events.map((event) => (
        <p key={event.id}>
          <strong>市場新聞</strong>
          <span>
            {event.headline} · 剩餘 {event.remainingDays} 天
          </span>
        </p>
      ))}
    </div>
  );
}
