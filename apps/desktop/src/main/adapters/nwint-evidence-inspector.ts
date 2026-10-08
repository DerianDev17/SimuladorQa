export interface NwintEvidence {
  lineCount: number;
  firstSourceTime?: string;
  lastSourceTime?: string;
  sourceTimezone: 'UNCONFIRMED';
  originPids: number[];
  destinationPids: number[];
  messageTypes: number[];
  stanObservations: { stan: string; line: number }[];
}

// Offline allowlist projection. Never return a source line, raw dump or private field.
// Times remain in the source clock; this adapter cannot establish clock alignment.
export class NwintEvidenceInspector {
  inspect(source: string): NwintEvidence {
    if (typeof source !== 'string' || source.length === 0 || source.length > 20_000_000)
      throw new Error('NWINT_SOURCE_INVALID');
    const lines = source.split(/\r?\n/);
    const originPids = new Set<number>(),
      destinationPids = new Set<number>(),
      messageTypes = new Set<number>();
    const stanObservations: NwintEvidence['stanObservations'] = [];
    let firstSourceTime: string | undefined, lastSourceTime: string | undefined;
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index]!;
      const time = line.match(/^((?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{6})\|/);
      if (time) {
        firstSourceTime ??= time[1]!;
        lastSourceTime = time[1]!;
      }
      for (const [key, values] of [
        ['org_pid', originPids],
        ['dest_pid', destinationPids],
        ['msgtype', messageTypes],
      ] as const) {
        const match = line.match(new RegExp(`(?:^|\\s)${key}\\s*=\\s*(\\d{1,8})(?=\\s|$)`));
        if (match) values.add(Number(match[1]));
      }
      // A digit sequence in a timestamp, hex dump or error text is not a STAN.
      if (/^\d{2}:\d{2}:\d{2}\.\d{6}\|\s+Field: #011\s*$/.test(line)) {
        const value = lines[index + 1]?.match(/^\s*6,\[(\d{6})\]\s*$/);
        if (value) stanObservations.push({ stan: value[1]!, line: index + 1 });
      }
    }
    if (!firstSourceTime || !originPids.size || !messageTypes.size)
      throw new Error('NWINT_PROFILE_UNSUPPORTED');
    return {
      lineCount: lines.length,
      firstSourceTime,
      ...(lastSourceTime ? { lastSourceTime } : {}),
      sourceTimezone: 'UNCONFIRMED',
      originPids: [...originPids].sort((a, b) => a - b),
      destinationPids: [...destinationPids].sort((a, b) => a - b),
      messageTypes: [...messageTypes].sort((a, b) => a - b),
      stanObservations,
    };
  }
}
