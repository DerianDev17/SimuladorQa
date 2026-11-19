import { parseObservationRequest } from '../../../../packages/domain/src/observations';
import { isRecord } from '../../../../packages/domain/src/index';

interface Interval {
  from: string;
  to: string;
}
interface IntervalStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
const key = 'qa.mediator.interval.v1';
function validInterval(value: unknown): value is Interval {
  return (
    isRecord(value) &&
    Object.keys(value).length === 2 &&
    !!parseObservationRequest({
      environment: 'QA',
      entityId: 205,
      channelId: 1,
      from: value.from,
      to: value.to,
      terminalId: '',
      transactionCode: '',
      terminalSequence: '',
      returnCode: '',
      limit: 50,
    })
  );
}
// Persist only operator-entered SQL dates; never convert an undocumented SQL zone.
export function readObservationInterval(storage: () => IntervalStorage): Interval {
  try {
    const raw = storage().getItem(key);
    if (!raw || raw.length > 150) return { from: '', to: '' };
    const value: unknown = JSON.parse(raw);
    if (validInterval(value)) return { from: value.from, to: value.to };
  } catch {
    /* Storage may be unavailable; the operator can still query. */
  }
  return { from: '', to: '' };
}
export function saveObservationInterval(
  storage: () => IntervalStorage,
  interval: Interval,
): boolean {
  if (!validInterval(interval)) return false;
  try {
    storage().setItem(key, JSON.stringify(interval));
    return true;
  } catch {
    return false;
  }
}
