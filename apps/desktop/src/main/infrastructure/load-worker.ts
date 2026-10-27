import { parentPort, workerData } from 'node:worker_threads';
import { performance } from 'node:perf_hooks';
import {
  LOAD_TEST_LOCAL_MIN_TPS,
  loadTargetTps,
  parseLoadTestDraft,
} from '../../../../../packages/domain/src/load-test';
import { loadPacingDelay } from './load-pacing';

const plan = parseLoadTestDraft(workerData);
if (!parentPort || !plan || plan.concurrency !== 1 || plan.targetTps < LOAD_TEST_LOCAL_MIN_TPS)
  throw Error('INVALID_LOAD_PLAN');
const port = parentPort;
const start = performance.now();
let sent = 0;
let last = start;
let stopped = false;
let timer: ReturnType<typeof setTimeout> | undefined;
const deadline = setTimeout(() => finish('DURATION'), plan.durationSeconds * 1000);
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
  const elapsed = performance.now() - start;
  const rate = loadTargetTps(plan!, elapsed);
  const wait = loadPacingDelay(sent, last, performance.now(), rate);
  timer = setTimeout(() => {
    if (stopped) return;
    last = performance.now();
    sent++;
    port.postMessage({ type: 'tick' });
  }, wait);
}
port.on('message', (message: unknown) => {
  if (message === 'next') {
    // Pace from the previous start. A slow card/host operation already used
    // its interval; adding another interval would reduce throughput further.
    schedule();
  } else if (message === 'stop') finish('STOP');
});
schedule();
