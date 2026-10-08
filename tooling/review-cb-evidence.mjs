import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash, randomUUID } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { build } from 'esbuild';

async function inspect() {
  const memory = [];
  const capturePath = process.argv[2] ?? 'Tramas transacciones/PruebaSimulador.pcap';
  const logPath = process.argv[3];
  if (!logPath) throw Error('NWINT_PATH_REQUIRED');
  const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
  const definition = JSON.parse(
    await readFile('artifacts/isobasei-definition-review.json', 'utf8'),
  ).definition;
  const profile = JSON.parse(await readFile('artifacts/qa-cb-balance-case.json', 'utf8'));
  const safeFields = new Set([3, 4, 7, 11, 12, 13, 15, 18, 19, 22, 25, 37, 39, 41, 49]);
  function ebcdic(bytes) {
    return [...bytes]
      .map((b) =>
        b >= 0xf0 && b <= 0xf9
          ? String(b - 0xf0)
          : b >= 0xc1 && b <= 0xc9
            ? String.fromCharCode(65 + b - 0xc1)
            : b >= 0xd1 && b <= 0xd9
              ? String.fromCharCode(74 + b - 0xd1)
              : b >= 0xe2 && b <= 0xe9
                ? String.fromCharCode(83 + b - 0xe2)
                : b === 0x40
                  ? ' '
                  : '?',
      )
      .join('');
  }
  function parse(wire) {
    if (wire.length < 36) throw Error('FRAMING_UNEXPECTED');
    const body = wire.subarray(4);
    if (
      wire.readUInt16BE(0) !== body.length ||
      body[0] !== 22 ||
      body.readUInt16BE(3) !== body.length ||
      ![0x0200, 0x0210].includes(body.readUInt16BE(22))
    )
      throw Error('FRAMING_UNEXPECTED');
    const bitmapBytes = body[24] & 128 ? 16 : 8;
    let cursor = 24 + bitmapBytes;
    const segments = new Map(),
      safe = {};
    for (let bit = 1; bit < bitmapBytes * 8; bit++) {
      if (!(body[24 + Math.floor(bit / 8)] & (128 >> (bit % 8)))) continue;
      const field = bit + 1,
        item = definition.fields[field],
        start = cursor;
      if (!item || ![2, 3, 4].includes(item.encodingCode) || ![0, 1].includes(item.attributeCode))
        throw Error('PROFILE_UNSUPPORTED');
      const length = item.attributeCode === 1 ? body[cursor++] : item.lengthParameter;
      const valueStart = cursor;
      cursor += item.encodingCode === 4 ? Math.ceil(length / 2) : length;
      if (
        !Number.isInteger(length) ||
        length < 1 ||
        length > item.lengthParameter ||
        cursor > body.length
      )
        throw Error('FIELD_TRUNCATED');
      segments.set(field, {
        start,
        valueStart,
        end: cursor,
        value: body.subarray(valueStart, cursor),
        wire: body.subarray(start, cursor),
        length,
      });
      if (safeFields.has(field))
        safe[`F${field}`] =
          item.encodingCode === 4
            ? body.subarray(valueStart, cursor).toString('hex').slice(-length)
            : ebcdic(body.subarray(valueStart, cursor));
    }
    if (cursor !== body.length) throw Error('UNCONSUMED_BYTES');
    return { body, segments, safe, mti: body.subarray(22, 24).toString('hex') };
  }
  function summarize(wire, frame) {
    const parsed = parse(wire);
    return {
      frame,
      wireBytes: wire.length,
      bodyBytes: parsed.body.length,
      mti: parsed.mti,
      fieldNumbers: [...parsed.segments.keys()],
      safeFields: parsed.safe,
      authorizationField38Present: parsed.segments.has(38),
      protectedFields: [...parsed.segments]
        .filter(([field]) => !safeFields.has(field))
        .map(([field, s]) => ({ field, valueBytes: s.value.length })),
    };
  }
  function diff(a, b) {
    const left = parse(a),
      right = parse(b);
    return [...new Set([...left.segments.keys(), ...right.segments.keys()])].map((field) => {
      const x = left.segments.get(field),
        y = right.segments.get(field);
      return {
        field,
        status: !x ? 'ADDED' : !y ? 'REMOVED' : x.wire.equals(y.wire) ? 'IDENTICAL' : 'CHANGED',
        sourceBytes: x?.value.length,
        comparedBytes: y?.value.length,
        ...(safeFields.has(field)
          ? { source: left.safe[`F${field}`], compared: right.safe[`F${field}`] }
          : {}),
      };
    });
  }
  try {
    const original = await readFile(capturePath);
    memory.push(original);
    if (hash(original) !== profile.sourceSha256) throw Error('SOURCE_CHANGED');
    const { stdout } = await promisify(execFile)(
      'C:/Program Files/Wireshark/tshark.exe',
      [
        '-n',
        '-r',
        capturePath,
        '-Y',
        'frame.number == 218 || frame.number == 220 || frame.number == 222 || frame.number == 224 || frame.number == 248 || frame.number == 250 || frame.number == 252 || frame.number == 254',
        '-T',
        'fields',
        '-E',
        'separator=\t',
        '-e',
        'frame.number',
        '-e',
        'frame.time_epoch',
        '-e',
        'ip.src',
        '-e',
        'tcp.srcport',
        '-e',
        'ip.dst',
        '-e',
        'tcp.dstport',
        '-e',
        'tcp.payload',
      ],
      { windowsHide: true, timeout: 10000, maxBuffer: 20000 },
    );
    const frames = new Map();
    for (const row of stdout.trim().split(/\r?\n/)) {
      const [frame, epoch, src, sport, dst, dport, hex] = row.split('\t'),
        wire = Buffer.from(hex, 'hex');
      memory.push(wire);
      frames.set(Number(frame), {
        wire,
        capturedAtUtc: new Date(Number(epoch) * 1000).toISOString(),
        src,
        sport: Number(sport),
        dst,
        dport: Number(dport),
      });
    }
    const baseline = frames.get(218).wire;
    if (hash(baseline) !== profile.request.payloadSha256) throw Error('BASELINE_CHANGED');
    const compilation = await build({
      stdin: {
        contents:
          "export { CapturedVisaBalance } from './apps/desktop/src/main/adapters/captured-visa-balance'; export { NwintEvidenceInspector } from './apps/desktop/src/main/adapters/nwint-evidence-inspector';",
        resolveDir: process.cwd(),
        loader: 'ts',
      },
      bundle: true,
      write: false,
      platform: 'node',
      format: 'esm',
    });
    const { CapturedVisaBalance, NwintEvidenceInspector } = await import(
      `data:text/javascript;base64,${Buffer.from(compilation.outputFiles[0].text).toString('base64')}`
    );
    const rebuilt = new CapturedVisaBalance().rebuildRequest(baseline.subarray(4));
    memory.push(rebuilt);
    if (!rebuilt.equals(baseline.subarray(4))) throw Error('REBUILD_CHANGED');
    const attempts = [];
    let preparedOnlyCount = 0;
    for (const file of (await readdir('artifacts')).filter((name) =>
      /^qa-cb-balance-attempt-.*\.json$/.test(name),
    )) {
      const attempt = JSON.parse(await readFile(`artifacts/${file}`, 'utf8'));
      if (attempt.status === 'PREPARED_ONLY') {
        if (attempt.writeAttempted || attempt.bytesWritten) throw Error('ATTEMPT_CONTRADICTORY');
        preparedOnlyCount++;
        continue;
      }
      if (!attempt.writeAttempted) {
        if (attempt.bytesWritten) throw Error('ATTEMPT_CONTRADICTORY');
        continue;
      }
      if (!attempt.bytesWritten) continue;
      const candidate = Buffer.from(baseline);
      memory.push(candidate);
      for (const change of attempt.fieldChanges ?? []) {
        if (change.field !== 11 || !/^\d{6}$/.test(change.value))
          throw Error('UNDOCUMENTED_CHANGE');
        const span = parse(candidate).segments.get(11);
        candidate.set(Buffer.from(change.value, 'hex'), 4 + span.valueStart);
      }
      const parsedCandidate = parse(candidate);
      if (
        parsedCandidate.safe.F11 !== attempt.request.stan ||
        parsedCandidate.safe.F37 !== attempt.request.rrn ||
        parsedCandidate.safe.F41 !== attempt.request.terminalId
      )
        throw Error('ATTEMPT_METADATA_MISMATCH');
      const reconstructedHashMatchesRecordedSend = hash(candidate) === attempt.requestPayloadSha256;
      if (!reconstructedHashMatchesRecordedSend || candidate.length !== attempt.bytesWritten)
        throw Error('SEND_HASH_MISMATCH');
      const changedWireOffsets = [];
      for (let i = 0; i < baseline.length; i++)
        if (baseline[i] !== candidate[i]) changedWireOffsets.push(i);
      attempts.push({
        runId: attempt.runId,
        transactionId: attempt.transactionId,
        sentAtUtc: attempt.writeAttemptedAt,
        stan: attempt.request.stan,
        responseCode: attempt.correlatedResponse?.responseCode,
        reconstructedHashMatchesRecordedSend,
        byteIdenticalToCapturedRequest: candidate.equals(baseline),
        changedWireOffsets,
        envelopeIdentical: candidate.subarray(0, 4).equals(baseline.subarray(0, 4)),
        visaHeaderAndBitmapIdentical: candidate.subarray(4, 36).equals(baseline.subarray(4, 36)),
        safeFields: parse(candidate).safe,
        fieldComparisons: diff(baseline, candidate),
        cardDataSource: attempt.cardDataSource ?? 'QA_CAPTURE',
        readerIdentityRead: attempt.readerPresence?.identityStatus === 'READ',
        networkReplySent: attempt.networkReplySent,
        mode: candidate.equals(baseline) ? 'EXACT_CAPTURE_REPLAY' : 'CAPTURE_WITH_STAN_OVERRIDE',
        newTransactionValidated: false,
      });
    }
    attempts.sort((a, b) => a.sentAtUtc.localeCompare(b.sentAtUtc));
    const nwintBytes = await readFile(logPath);
    memory.push(nwintBytes);
    const nwint = new NwintEvidenceInspector().inspect(nwintBytes.toString('utf8'));
    const logCorrelation = attempts.map((attempt) => ({
      runId: attempt.runId,
      stan: attempt.stan,
      status: nwint.stanObservations.some((item) => item.stan === attempt.stan)
        ? 'STAN_OBSERVED_REQUIRES_TRANSACTION_CORRELATION'
        : 'NOT_OBSERVED_IN_SUPPLIED_LOG',
    }));
    const report = {
      nwint: { ...nwint, sha256: hash(nwintBytes) },
      logCorrelation,
      preparedOnlyCount,
      id: randomUUID(),
      analyzedAtUtc: new Date().toISOString(),
      method:
        'OFFLINE_RECONSTRUCTION_VERIFIED_AGAINST_RECORDED_SEND_SHA256_NOT_NEW_NETWORK_CAPTURE',
      sourceSha256: profile.sourceSha256,
      transmittedNow: false,
      capturedFrames: [...frames].map(([frame, p]) => ({
        ...summarize(p.wire, frame),
        capturedAtUtc: p.capturedAtUtc,
        src: p.src,
        sport: p.sport,
        dst: p.dst,
        dport: p.dport,
      })),
      attempts,
      atmToMediatorHistoricalTransformations: diff(baseline, frames.get(220).wire),
      balanceToWithdrawalHistoricalDifferences: diff(baseline, frames.get(248).wire),
    };
    const serialized = JSON.stringify(report, null, 2);
    for (const p of frames.values()) {
      const pan = parse(p.wire).segments.get(2)?.value.toString('hex');
      if (pan && serialized.includes(pan)) throw Error('PRIVACY_PROJECTION_FAILED');
    }
    await mkdir('artifacts', { recursive: true });
    await writeFile('artifacts/cb-capture-versus-simulator-comparison.json', serialized);
    console.log(
      JSON.stringify({
        id: report.id,
        verifiedSentAttempts: attempts.length,
        preparedOnlyCount,
        logCorrelation,
        logOriginPids: nwint.originPids,
        logDestinationPids: nwint.destinationPids,
        logMessageTypes: nwint.messageTypes,
        transmittedNow: false,
        report: 'artifacts/cb-capture-versus-simulator-comparison.json',
      }),
    );
  } finally {
    for (const bytes of memory) bytes.fill(0);
  }
}
inspect().catch(() => {
  console.error(
    'CB_EVIDENCE_REVIEW_INCOMPLETE: revisar rutas, hashes, perfil y registros locales.',
  );
  process.exitCode = 1;
});
