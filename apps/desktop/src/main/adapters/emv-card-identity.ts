import type {
  CardApplication,
  CardIdentityReading,
} from '../../../../../packages/domain/src/card-reader';

// EMV 4.3 Book 1 §§11–12; Book 3 §§6.5.8, 10.2 and Annexes A/B.
// Supports the contact PSE and GPO with empty PDOL or explicit terminal country (9F1A).
export interface CardApduSession {
  transmit(command: Uint8Array): Promise<Uint8Array>;
  releaseTransaction(): Promise<void>;
  isValid(): Promise<boolean>;
  close(): void;
}

interface Tlv {
  tag: string;
  value: Uint8Array;
  children: Tlv[];
}
function invalid(): never {
  throw Error('CARD_DATA_INVALID');
}

export function parseCardTlv(bytes: Uint8Array, depth = 0): Tlv[] {
  if (bytes.length > 4096 || depth > 8) invalid();
  const nodes: Tlv[] = [];
  let offset = 0;
  while (offset < bytes.length) {
    const first = bytes[offset++]!;
    if (first === 0 || first === 255) continue;
    const tagBytes = [first];
    if ((first & 31) === 31) {
      let next: number;
      do {
        if (offset >= bytes.length || tagBytes.length >= 3) invalid();
        next = bytes[offset++]!;
        if (tagBytes.length === 1 && (next & 127) === 0) invalid();
        tagBytes.push(next);
      } while (next & 128);
    }
    if (offset >= bytes.length) invalid();
    let length = bytes[offset++]!;
    if (length & 128) {
      const count = length & 127;
      if (count < 1 || count > 2 || offset + count > bytes.length) invalid();
      length = 0;
      for (let i = 0; i < count; i++) length = length * 256 + bytes[offset++]!;
    }
    if (offset + length > bytes.length || nodes.length >= 128) invalid();
    const value = bytes.subarray(offset, offset + length);
    offset += length;
    nodes.push({
      tag: Buffer.from(tagBytes).toString('hex').toUpperCase(),
      value,
      children: first & 32 ? parseCardTlv(value, depth + 1) : [],
    });
  }
  return nodes;
}
function findAll(nodes: Tlv[], tag: string): Tlv[] {
  return nodes.flatMap((node) => [
    ...(node.tag === tag ? [node] : []),
    ...findAll(node.children, tag),
  ]);
}
function unique(nodes: Tlv[], tag: string): Uint8Array | undefined {
  const found = findAll(nodes, tag);
  if (found.length > 1) invalid();
  return found[0]?.value;
}
function text(bytes: Uint8Array | undefined, max: number): string | null {
  if (!bytes) return null;
  if (!bytes.length || bytes.length > max || bytes.some((byte) => byte < 32 || byte > 126))
    invalid();
  return (
    Buffer.from(bytes)
      .toString('ascii')
      .trim()
      .replace(/\d{12,19}/g, '[PROTEGIDO]') || null
  );
}
function hex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('hex').toUpperCase();
}

export function parseCardDol(bytes: Uint8Array): { tag: string; length: number }[] {
  if (bytes.length > 128) invalid();
  const entries: { tag: string; length: number }[] = [];
  let offset = 0;
  let total = 0;
  while (offset < bytes.length) {
    const start = offset;
    const first = bytes[offset++]!;
    if (first === 0 || first === 255 || first & 32) invalid();
    if ((first & 31) === 31) {
      let next: number;
      do {
        if (offset >= bytes.length || offset - start >= 3) invalid();
        next = bytes[offset++]!;
        if (offset - start === 2 && (next & 127) === 0) invalid();
      } while (next & 128);
    }
    const tag = hex(bytes.subarray(start, offset));
    if (offset >= bytes.length) invalid();
    const length = bytes[offset++]!;
    total += length;
    if (
      !length ||
      total > 128 ||
      entries.length >= 32 ||
      entries.some((entry) => entry.tag === tag)
    )
      invalid();
    entries.push({ tag, length });
  }
  return entries;
}
function select(name: Uint8Array): Uint8Array {
  if (name.length < 5 || name.length > 16) invalid();
  return Uint8Array.from([0, 0xa4, 4, 0, name.length, ...name, 0]);
}
function record(sfi: number, number: number): Uint8Array {
  if (sfi < 1 || sfi > 30 || number < 1 || number > 255) invalid();
  return Uint8Array.from([0, 0xb2, number, (sfi << 3) | 4, 0]);
}

// Bounded T=0 continuation and wrong Le recovery; never retries other failures.
export async function exchangeCard(
  session: CardApduSession,
  command: Uint8Array,
): Promise<{ data: Uint8Array; status: number }> {
  let current = command;
  const parts: number[] = [];
  let corrected = false;
  for (let attempt = 0; attempt < 8; attempt++) {
    const response = await session.transmit(current);
    if (response.length < 2 || response.length > 4098) invalid();
    const sw1 = response[response.length - 2]!,
      sw2 = response[response.length - 1]!;
    if (sw1 === 0x6c && response.length === 2 && !corrected) {
      current = current.slice();
      current[current.length - 1] = sw2;
      corrected = true;
      continue;
    }
    parts.push(...response.subarray(0, -2));
    if (parts.length > 4096) invalid();
    if (sw1 === 0x61) {
      current = Uint8Array.from([0, 0xc0, 0, 0, sw2]);
      corrected = false;
      continue;
    }
    return { data: Uint8Array.from(parts), status: (sw1 << 8) | sw2 };
  }
  invalid();
}
function requireSuccess(response: { data: Uint8Array; status: number }): Tlv[] {
  if (response.status !== 0x9000) throw Error('CARD_COMMAND_REJECTED');
  return parseCardTlv(response.data);
}

export function decodeCardFields(
  nodes: ReturnType<typeof parseCardTlv>,
): Pick<CardIdentityReading, 'panMasked' | 'cardholderName' | 'expiry'> {
  const pan = unique(nodes, '5A');
  let panMasked: string | null = null;
  if (pan) {
    const digits = hex(pan).replace(/F+$/, '');
    if (!/^\d{12,19}$/.test(digits) || pan.length > 10) invalid();
    panMasked = '*'.repeat(digits.length - 4) + digits.slice(-4);
  }
  const date = unique(nodes, '5F24');
  let expiry: string | null = null;
  if (date) {
    const digits = hex(date);
    if (!/^\d{6}$/.test(digits)) invalid();
    const year = Number(digits.slice(0, 2)),
      month = Number(digits.slice(2, 4)),
      day = Number(digits.slice(4));
    const days = [31, year % 4 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (month < 1 || month > 12 || day < 1 || day > days[month - 1]!) invalid();
    expiry = `${digits.slice(2, 4)}/${digits.slice(0, 2)}`;
  }
  return { panMasked, cardholderName: text(unique(nodes, '5F20'), 26), expiry };
}

export async function readEmvIdentity(
  session: CardApduSession,
  base: Pick<CardIdentityReading, 'readId' | 'readAt' | 'readerName'>,
  applicationId?: string,
  terminalCountryCode?: string,
): Promise<CardIdentityReading> {
  const result: CardIdentityReading = {
    ...base,
    status: 'DIRECTORY_UNAVAILABLE',
    applications: [],
    applicationId: null,
    applicationLabel: null,
    panMasked: null,
    cardholderName: null,
    expiry: null,
  };
  const directory = await exchangeCard(session, select(Buffer.from('1PAY.SYS.DDF01', 'ascii')));
  if (directory.status === 0x6a82 || directory.status === 0x6283) return result;
  const fci = requireSuccess(directory);
  if (hex(unique(fci, '84') ?? new Uint8Array()) !== hex(Buffer.from('1PAY.SYS.DDF01'))) invalid();
  const sfi = unique(fci, '88');
  if (!sfi || sfi.length !== 1 || sfi[0]! < 1 || sfi[0]! > 30) invalid();
  const applications: CardApplication[] = [];
  let complete = false;
  for (let number = 1; number <= 32; number++) {
    const response = await exchangeCard(session, record(sfi[0]!, number));
    if (response.status === 0x6a83) {
      complete = true;
      break;
    }
    const records = requireSuccess(response);
    for (const entry of findAll(records, '61')) {
      const aid = unique(entry.children, '4F');
      if (!aid || aid.length < 5 || aid.length > 16) invalid();
      const app = { id: hex(aid), label: text(unique(entry.children, '50'), 16) };
      if (applications.some((known) => known.id === app.id) || applications.length >= 16) invalid();
      applications.push(app);
    }
  }
  if (!complete) invalid();
  result.applications = applications;
  if (!applications.length) return result;
  const selected = applicationId
    ? applications.find((app) => app.id === applicationId)
    : applications.length === 1
      ? applications[0]
      : undefined;
  if (applicationId && !selected) throw Error('CARD_APPLICATION_CHANGED');
  if (!selected) {
    result.status = 'SELECT_APPLICATION';
    return result;
  }
  result.applicationId = selected.id;
  const application = requireSuccess(
    await exchangeCard(session, select(Buffer.from(selected.id, 'hex'))),
  );
  if (hex(unique(application, '84') ?? new Uint8Array()) !== selected.id) invalid();
  result.applicationLabel = text(unique(application, '50'), 16) ?? selected.label;
  const pdol = unique(application, '9F38');
  let gpo = Uint8Array.from([0x80, 0xa8, 0, 0, 2, 0x83, 0, 0]);
  if (pdol?.length) {
    const required = parseCardDol(pdol);
    if (
      !terminalCountryCode ||
      required.length !== 1 ||
      required[0]?.tag !== '9F1A' ||
      required[0].length !== 2
    ) {
      result.requiredTerminalData = required;
      result.status = 'TERMINAL_DATA_REQUIRED';
      return result;
    }
    if (!/^(?!000)\d{3}$/.test(terminalCountryCode)) invalid();
    const country = Buffer.from('0' + terminalCountryCode, 'hex');
    gpo = Uint8Array.from([0x80, 0xa8, 0, 0, 4, 0x83, 2, ...country, 0]);
  }
  const options = requireSuccess(await exchangeCard(session, gpo));
  let afl: Uint8Array | undefined;
  if (options.length === 1 && options[0]?.tag === '80') {
    if (options[0].value.length < 6) invalid();
    afl = options[0].value.subarray(2);
  } else if (options.length === 1 && options[0]?.tag === '77') {
    const aip = unique(options, '82');
    if (aip?.length !== 2) invalid();
    afl = unique(options, '94');
  } else invalid();
  if (!afl?.length || afl.length % 4) invalid();
  const requests: Uint8Array[] = [];
  const seen = new Set<string>();
  for (let offset = 0; offset < afl.length; offset += 4) {
    const file = afl[offset]!,
      first = afl[offset + 1]!,
      last = afl[offset + 2]!,
      auth = afl[offset + 3]!;
    if (
      (file & 7) !== 0 ||
      file >> 3 < 1 ||
      file >> 3 > 30 ||
      first === 0 ||
      last < first ||
      auth > last - first + 1
    )
      invalid();
    for (let number = first; number <= last; number++) {
      const key = `${file}-${number}`;
      if (seen.has(key) || requests.length >= 64) invalid();
      seen.add(key);
      requests.push(record(file >> 3, number));
    }
  }
  const data: Tlv[] = [];
  for (const command of requests) {
    const nodes = requireSuccess(await exchangeCard(session, command));
    if (nodes.length !== 1 || nodes[0]?.tag !== '70') invalid();
    data.push(...nodes[0].children);
  }
  Object.assign(result, decodeCardFields(data));
  result.status = 'READ';
  return result;
}
