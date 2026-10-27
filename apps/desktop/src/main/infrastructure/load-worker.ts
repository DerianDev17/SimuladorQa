import { parentPort, workerData } from 'node:worker_threads';
import { performance } from 'node:perf_hooks';
import {
  LOAD_TEST_LOCAL_MIN_TPS,
  loadTargetTps,
  parseLoadTestDraft,
} from '../../../../../packages/domain/src/load-test';
import { loadPacingDelay } from './load-pacing';

const plan = parseLoadTestDraft(workerData?.draft);
const startedAt: unknown = workerData?.startedAt;
if (
  !parentPort ||
  !plan ||
  plan.concurrency !== 1 ||
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
let awaitingResult = false;
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
  if (stopped) return;
  if (sent >= plan!.maxTransactions) return finish('COUNT');
  if (elapsed() >= plan!.durationSeconds * 1000) return finish('DURATION');
  const rate = loadTargetTps(plan!, elapsed());
  const wait = loadPacingDelay(sent, last, performance.now(), rate);
  timer = setTimeout(() => {
    if (stopped) return;
    if (elapsed() >= plan!.durationSeconds * 1000) return finish('DURATION');
    last = performance.now();
    sent++;
    awaitingResult = true;
    port.postMessage({ type: 'tick' });
  }, wait);
}
port.on('message', (message: unknown) => {
  if (
    message &&
    typeof message === 'object' &&
    'type' in message &&
    message.type === 'next' &&
    awaitingResult
  ) {
    awaitingResult = false;
    if (
      'operationStartedAt' in message &&
      typeof message.operationStartedAt === 'number' &&
      Number.isFinite(message.operationStartedAt)
    ) {
      // Posting a tick is not the same as Main starting the card operation.
      // Delayed delivery must not turn the next operation into a catch-up burst.
      last = Math.max(last, message.operationStartedAt - performance.timeOrigin);
    }
    // Pace from the previous start. A slow card/host operation already used
    // its interval; adding another interval would reduce throughput further.
    schedule();
  } else if (message === 'stop') finish('STOP');
});
schedule();
