'use client';
import { Time } from '@nastra/nhis';

const DAY = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: '2-digit', month: 'short' });

/** UTC time, prefixed with the date when it is not today. History never reads as if it happened today. */
export function Stamp({ iso, now }: { iso: string; now?: string }) {
  const sameDay = iso.slice(0, 10) === (now ?? new Date().toISOString()).slice(0, 10);
  return (
    <span className="st-stamp">
      {!sameDay && <span className="nhis-num">{DAY.format(new Date(iso))} · </span>}
      <Time value={{ iso, system: 'UTC' }} seconds={false} />
    </span>
  );
}
