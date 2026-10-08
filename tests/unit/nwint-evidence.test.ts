import { expect, it } from 'vitest';
import { NwintEvidenceInspector } from '../../apps/desktop/src/main/adapters/nwint-evidence-inspector';

const inspector = new NwintEvidenceInspector();
const header =
  '16:00:01.747263|   opened\norg_pid = 00082262\tmsgtype = 00000800\ndest_pid = 00280120';

it('extracts only supported STAN records and preserves the source clock', () => {
  const evidence = inspector.inspect(
    `${header}\n16:19:29.505530|   Field: #011\n 6,[008103]\n16:46:32.520847|   complete`,
  );
  expect(evidence).toEqual({
    lineCount: 6,
    firstSourceTime: '16:00:01.747263',
    lastSourceTime: '16:46:32.520847',
    sourceTimezone: 'UNCONFIRMED',
    originPids: [82262],
    destinationPids: [280120],
    messageTypes: [800],
    stanObservations: [{ stan: '008103', line: 4 }],
  });
});

it('does not match digits in timestamps, hex, unrelated fields or arbitrary text', () => {
  const evidence = inspector.inspect(
    `${header}\n16:19:29.008103|   ignored\nSTAN 008103\n16:19:29.505530|   Field: #039\n 6,[008103]\n16:19:29.505530|   Field: #011\n 6,[008103] extra`,
  );
  expect(evidence.stanObservations).toEqual([]);
});

it('never projects protected fields or raw source text', () => {
  const protectedValue = 'PRIVATE_TEST_VALUE';
  const evidence = inspector.inspect(
    `${header}\nPAN=${protectedValue}\nPIN=${protectedValue}\nSVT_RAW_DATA ${protectedValue}`,
  );
  expect(JSON.stringify(evidence)).not.toContain(protectedValue);
});

it.each(['', 'x'.repeat(20_000_001)])('rejects empty or oversized sources', (source) => {
  expect(() => inspector.inspect(source)).toThrow('NWINT_SOURCE_INVALID');
});

it('rejects unsupported log structure with a fixed error', () => {
  expect(() => inspector.inspect('PRIVATE_TEST_VALUE')).toThrow('NWINT_PROFILE_UNSUPPORTED');
});
