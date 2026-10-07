import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { Buffer } from 'node:buffer';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { build } from 'esbuild';

// Herramienta local: RAW permanece en memoria y no se transmite a Electron/IPC.
const run = promisify(execFile);
const fields = [
  'tcp.stream',
  'ip.src',
  'tcp.srcport',
  'ip.dst',
  'tcp.dstport',
  'tcp.seq_raw',
  'tcp.payload',
];

function reassemble(segments) {
  segments.sort((left, right) => left.sequence - right.sequence);
  const start = segments[0].sequence;
  const end = Math.max(...segments.map((segment) => segment.sequence + segment.data.length));
  // No se interpreta wrap de 32 bits ni se rellena una captura incompleta.
  if (end - start > 10_000_000) throw new Error('REASSEMBLY_LIMIT_OR_SEQUENCE_WRAP');
  const data = Buffer.alloc(end - start);
  const present = Buffer.alloc(end - start);
  let conflicts = 0;
  for (const segment of segments) {
    const offset = segment.sequence - start;
    for (let index = 0; index < segment.data.length; index++) {
      const position = offset + index;
      if (present[position] && data[position] !== segment.data[index]) conflicts++;
      data[position] = segment.data[index];
      present[position] = 1;
    }
  }
  return { data, incomplete: present.includes(0), conflicts };
}

async function inspect() {
  const directory = resolve(process.argv[2] ?? 'Tramas transacciones');
  const tshark = process.argv[3] ?? 'C:\\Program Files\\Wireshark\\tshark.exe';
  const compiled = await build({
    stdin: {
      contents:
        "export * from './apps/desktop/src/main/infrastructure/inclusive-be16-framing'; export * from './apps/desktop/src/main/adapters/captured-banred-envelope';",
      resolveDir: process.cwd(),
      loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
  });
  const { InclusiveBe16Framing, CapturedBanredEnvelope } = await import(
    `data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString('base64')}`
  );
  const framing = new InclusiveBe16Framing();
  const envelope = new CapturedBanredEnvelope();
  const captures = [];
  const lengths = [];
  const observedHeaders = new Set();
  const files = (await readdir(directory)).filter((file) => /\.pcap$/i.test(file)).sort();
  if (!files.length) throw new Error('NO_CAPTURES');
  for (const file of files) {
    const path = join(directory, file);
    const original = await readFile(path);
    const { stdout } = await run(
      tshark,
      [
        '-n',
        '-r',
        path,
        '-Y',
        'tcp.len > 0',
        '-T',
        'fields',
        '-E',
        'separator=\t',
        ...fields.flatMap((field) => ['-e', field]),
      ],
      { timeout: 30_000, maxBuffer: 16 * 1024 * 1024, windowsHide: true },
    );
    const directions = new Map();
    for (const row of stdout.trim().split(/\r?\n/)) {
      if (!row) continue;
      const [stream, src, sport, dst, dport, seq, payload] = row.split('\t');
      if (!payload || !seq) throw new Error('CAPTURE_ROW_UNSUPPORTED');
      const key = [stream, src, sport, dst, dport].join('|');
      const direction = directions.get(key) ?? {
        matchesProfile: sport === '4946' || dport === '4946',
        segments: [],
      };
      const hex = payload.replaceAll(':', '');
      if (!/^(?:[0-9a-fA-F]{2})+$/.test(hex) || !/^\d+$/.test(seq))
        throw new Error('CAPTURE_ROW_UNSUPPORTED');
      direction.segments.push({ sequence: Number(seq), data: Buffer.from(hex, 'hex') });
      directions.set(key, direction);
    }
    const summary = {
      id: randomUUID(),
      file,
      sha256: createHash('sha256').update(original).digest('hex'),
      bytes: original.length,
      inspectedDirections: directions.size,
      unsupportedDirections: 0,
      conflictingDirections: 0,
      incompleteDirections: 0,
      messages: 0,
      mtiCounts: {},
    };
    for (const direction of directions.values()) {
      const reassembled = reassemble(direction.segments);
      if (reassembled.conflicts) summary.conflictingDirections++;
      if (reassembled.incomplete) summary.incompleteDirections++;
      if (!direction.matchesProfile) {
        summary.unsupportedDirections++;
        continue;
      }
      if (reassembled.conflicts) throw new Error('REASSEMBLY_CONFLICT');
      if (reassembled.incomplete) throw new Error('REASSEMBLY_GAP');
      const stream = reassembled.data;
      const decoder = framing.decoder();
      let offset = 0;
      // Revalidar el codec también con límites de chunk independientes del PCAP.
      for (let cursor = 0; cursor < stream.length; cursor += 37) {
        for (const body of decoder.push(stream.subarray(cursor, cursor + 37))) {
          const parsed = envelope.decode(body);
          observedHeaders.add(parsed.metadata.header);
          const rebuilt = framing.encode(
            envelope.encode(
              parsed.metadata.header,
              parsed.metadata.mti,
              parsed.bitmap,
              parsed.opaqueData,
            ),
          );
          if (!rebuilt.equals(stream.subarray(offset, offset + rebuilt.length)))
            throw new Error('ROUNDTRIP_MISMATCH');
          offset += rebuilt.length;
          lengths.push(rebuilt.length);
          summary.messages++;
          const mti = parsed.metadata.mti;
          summary.mtiCounts[mti] = (summary.mtiCounts[mti] ?? 0) + 1;
        }
      }
      decoder.finish();
      if (offset !== stream.length) throw new Error('STREAM_NOT_CONSUMED');
    }
    captures.push(summary);
  }
  if (!lengths.length) throw new Error('PROFILE_NOT_FOUND');
  const report = {
    id: randomUUID(),
    inspectedAt: new Date().toISOString(),
    document: 'docs/protocols/PCAP_REVIEW.md',
    environment: 'UNCONFIRMED',
    profile: {
      name: 'BANRED · enlace capturado 4946',
      prefixBytes: 2,
      byteOrder: 'BIG_ENDIAN',
      lengthIncludesPrefix: true,
      headerBytes: 12,
      mtiEncoding: 'ASCII',
      bitmapEncoding: 'ASCII_HEX',
      bitmapBits: 128,
      minimumObservedBytes: Math.min(...lengths),
      maximumObservedBytes: Math.max(...lengths),
      headers: [...observedHeaders].sort(),
    },
    captures,
  };
  await mkdir('artifacts', { recursive: true });
  await writeFile('artifacts/pcap-evidence.json', JSON.stringify(report, null, 2));
  console.log(
    `Inspección completada: ${captures.length} capturas; ${lengths.length} mensajes reconstruidos byte a byte. Metadatos en artifacts/pcap-evidence.json.`,
  );
}

try {
  await inspect();
} catch (error) {
  // Un error de tshark podría contener payload o rutas privadas: no imprimirlo.
  const safeCodes = [
    'REASSEMBLY_LIMIT_OR_SEQUENCE_WRAP',
    'REASSEMBLY_CONFLICT',
    'REASSEMBLY_GAP',
    'CAPTURE_ROW_UNSUPPORTED',
    'ROUNDTRIP_MISMATCH',
    'STREAM_NOT_CONSUMED',
    'ENVELOPE_INVALID',
    'ENVELOPE_UNSUPPORTED',
    'ENVELOPE_UNSUPPORTED_BITMAP',
    'FRAME_INVALID_LENGTH',
    'FRAME_INCOMPLETE',
    'NO_CAPTURES',
    'PROFILE_NOT_FOUND',
  ];
  if (error instanceof Error && safeCodes.includes(error.message)) console.error(error.message);
  console.error('Inspección incompleta. Revisa la fuente local, tshark y el perfil documentado.');
  process.exitCode = 1;
}
