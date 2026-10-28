import { parentPort, workerData } from 'node:worker_threads';
import { performance } from 'node:perf_hooks';
import {
  LOAD_TEST_LOCAL_MIN_TPS,
  loadTargetTps,
  parseLoadTestDraft,
} from '../../../../../packages/domain/src/load-test';
import { loadPacingDelay } from './load-pacing';
import { LOAD_RUN_MAX_CONCURRENCY } from '../../../../../packages/domain/src/load-run';

const plan = parseLoadTestDraft(workerData?.draft);
const startedAt: unknown = workerData?.startedAt;
if (
  !parentPort ||
  !plan ||
  plan.concurrency > LOAD_RUN_MAX_CONCURRENCY ||
  plan.targetTps < LOAD_TEST_LOCAL_MIN_TPS ||
  typeof startedAt !== 'number' ||
  !Number.isFinite(startedAt)
)
  throw Error('INVALID_LOAD_PLAN');
const port = parentPort;
const start = startedAt;
const elapsed = () => Math.max(0, performance.timeOrigin + performance.now() - start);
let sent = 0;
let last = performance.now();
const active = new Map<number, boolean>();
let stopped = false;
let timer: ReturnType<typeof setTimeout> | undefined;
const deadline = setTimeout(
  () => finish('DURATION'),
  Math.max(0, plan.durationSeconds * 1000 - elapsed()),
);
function finish(reason: string) {
  if (stopped) return;
  stopped = true;
  clearTimeout(timer);
  clearTimeout(deadline);
  port.postMessage({ type: 'done', reason });
  port.close();
}
function schedule() {
  if (stopped || timer || [...active.values()].some((accepted) => !accepted)) return;
  if (sent >= plan!.maxTransactions) {
    if (!active.size) finish('COUNT');
    return;
  }
  if (elapsed() >= plan!.durationSeconds * 1000) return finish('DURATION');
  if (active.size >= plan!.concurrency) return;
  const rate = loadTargetTps(plan!, elapsed());
  const wait = loadPacingDelay(sent, last, performance.now(), rate);
  timer = setTimeout(() => {
    timer = undefined;
    if (stopped) return;
    if (elapsed() >= plan!.durationSeconds * 1000) return finish('DURATION');
    last = performance.now();
    sent++;
    active.set(sent, false);
    port.postMessage({ type: 'tick', ticket: sent });
  }, wait);
}
port.on('message', (message: unknown) => {
  if (
    message &&
    typeof message === 'object' &&
    'type' in message &&
    (message.type === 'next' || message.type === 'started') &&
    'ticket' in message &&
    typeof message.ticket === 'number' &&
    active.has(message.ticket)
  ) {
    if (
      !active.get(message.ticket) &&
      'operationStartedAt' in message &&
      typeof message.operationStartedAt === 'number' &&
      Number.isFinite(message.operationStartedAt)
    ) {
      // Posting a tick is not the same as Main starting the card operation.
      // Delayed delivery must not turn the next operation into a catch-up burst.
      last = Math.max(last, message.operationStartedAt - performance.timeOrigin);
    }
    if (message.type === 'started') active.set(message.ticket, true);
    else active.delete(message.ticket);
    // Start acknowledgements allow overlap; completion frees exactly one slot.
    // A delayed tick cannot accumulate rate credit or trigger catch-up bursts.
    schedule();
  } else if (message === 'stop') finish('STOP');
});
schedule();
