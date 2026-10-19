import { open } from 'node:fs/promises';
import { isIPv4 } from 'node:net';
import { isRecord } from '../../../../../packages/domain/src/index';
import { isUuid, isRevision } from '../../../../../packages/domain/src/catalogs';
import type { BalanceReadiness } from '../../../../../packages/domain/src/balance-inquiry';
import type { BalanceContextProvider, BalanceContextLease } from '../balance-ports';
import type { QaAtmContextBinding } from '../qa-balance-context-router';

// Documentary configuration is distinct from an executable crypto contract.
// No wrapped/clear key, PIN, PAN, captured F52/F55 or executable bytes belong here.
export interface QaAtmEvidenceBinding {
  id: string;
  environment: 'QA';
  entityCode: '205';
  atmId: string;
  atmRevision: number;
  terminalId: string;
  endpoint: { host: string; port: number };
  atmPid: string;
  corePid: string;
  coreEndpoint: { host: string; port: number };
  pinBlockFormatCode: string;
  keyCheckValue: string;
  keyLengthSetting: number;
  ppkIndex: number;
  sameReportedKeyBlock: boolean;
  sourceReference: string;
  recordedAt: string;
}

const names = [
  'id',
  'environment',
  'entityCode',
  'atmId',
  'atmRevision',
  'terminalId',
  'endpoint',
  'atmPid',
  'corePid',
  'coreEndpoint',
  'pinBlockFormatCode',
  'keyCheckValue',
  'keyLengthSetting',
  'ppkIndex',
  'sameReportedKeyBlock',
  'sourceReference',
  'recordedAt',
];
function exact(row: Record<string, unknown>, fields: string[]): boolean {
  return (
    Object.keys(row).length === fields.length && fields.every((key) => Object.hasOwn(row, key))
  );
}
function endpoint(value: unknown): boolean {
  return (
    isRecord(value) &&
    exact(value, ['host', 'port']) &&
    typeof value.host === 'string' &&
    isIPv4(value.host) &&
    Number.isInteger(value.port) &&
    Number(value.port) > 0 &&
    Number(value.port) <= 65535
  );
}

export function parseQaAtmEvidenceBindings(input: unknown): QaAtmEvidenceBinding[] {
  if (
    !isRecord(input) ||
    !exact(input, ['version', 'bindings']) ||
    input.version !== 1 ||
    !Array.isArray(input.bindings) ||
    input.bindings.length > 50
  )
    throw Error('QA_ATM_EVIDENCE_INVALID');
  const ids = new Set<string>(),
    atms = new Set<string>();
  for (const row of input.bindings) {
    if (
      !isRecord(row) ||
      !exact(row, names) ||
      row.environment !== 'QA' ||
      row.entityCode !== '205' ||
      !isUuid(row.id) ||
      !isUuid(row.atmId) ||
      !isRevision(row.atmRevision) ||
      typeof row.terminalId !== 'string' ||
      !/^[A-Z0-9]{8}$/.test(row.terminalId) ||
      !endpoint(row.endpoint) ||
      !endpoint(row.coreEndpoint) ||
      typeof row.atmPid !== 'string' ||
      !/^\d{1,8}$/.test(row.atmPid) ||
      typeof row.corePid !== 'string' ||
      !/^\d{1,8}$/.test(row.corePid) ||
      typeof row.pinBlockFormatCode !== 'string' ||
      !/^\d{2}$/.test(row.pinBlockFormatCode) ||
      typeof row.keyCheckValue !== 'string' ||
      !/^[A-F0-9]{6}$/.test(row.keyCheckValue) ||
      !Number.isInteger(row.keyLengthSetting) ||
      Number(row.keyLengthSetting) < 1 ||
      Number(row.keyLengthSetting) > 128 ||
      !Number.isInteger(row.ppkIndex) ||
      Number(row.ppkIndex) < 0 ||
      Number(row.ppkIndex) > 999 ||
      typeof row.sameReportedKeyBlock !== 'boolean' ||
      typeof row.sourceReference !== 'string' ||
      !/^[A-Za-z][A-Za-z0-9_. /-]{1,127}$/.test(row.sourceReference) ||
      /\d{12}/.test(row.sourceReference) ||
      typeof row.recordedAt !== 'string' ||
      !/^20\d{2}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(row.recordedAt) ||
      !Number.isFinite(Date.parse(row.recordedAt)) ||
      ids.has(row.id) ||
      atms.has(row.atmId)
    )
      throw Error('QA_ATM_EVIDENCE_INVALID');
    ids.add(row.id);
    atms.add(row.atmId);
  }
  return structuredClone(input.bindings) as QaAtmEvidenceBinding[];
}

export class FileQaAtmEvidenceBindings {
  constructor(private readonly path: string) {}
  async read(): Promise<QaAtmEvidenceBinding[]> {
    const file = await open(this.path, 'r');
    try {
      if ((await file.stat()).size > 65536) throw Error('QA_ATM_EVIDENCE_INVALID');
      const buffer = Buffer.alloc(65537);
      try {
        const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
        if (bytesRead > 65536) throw Error('QA_ATM_EVIDENCE_INVALID');
        return parseQaAtmEvidenceBindings(
          JSON.parse(buffer.subarray(0, bytesRead).toString('utf8')),
        );
      } finally {
        buffer.fill(0);
      }
    } finally {
      await file.close();
    }
  }
}

class DocumentedQaBalanceContext implements BalanceContextProvider {
  constructor(private readonly evidence: QaAtmEvidenceBinding) {}
  async inspect(): Promise<BalanceReadiness> {
    const row = this.evidence;
    return {
      ready: false,
      blockers: [
        {
          id: 'QA-PIN-HSM-BINDING',
          label: `${row.terminalId} vinculado: PID ${row.atmPid} → CB ${row.corePid}. Configuración de seguridad recibida; falta conectar el cifrado del PIN`,
        },
        {
          id: 'QA-PIN-FORMAT-MAPPING',
          label: `SmartVista declara formato PIN ${row.pinBlockFormatCode}. Falta validar su correspondencia con el cifrador originador; no se cambia por inferencia`,
        },
        {
          id: 'QA-SEQUENCE-CALENDAR-BINDING',
          label:
            'Falta vincular una secuencia exclusiva del simulador y la fecha contable vigente; no se reutiliza el serial del cajero físico',
        },
      ],
    };
  }
  async acquire(): Promise<BalanceContextLease> {
    // Evidence never authorizes PIN entry, GENERATE AC, socket or financial write.
    throw Error('QA_DOCUMENTED_CONTEXT_NOT_EXECUTABLE');
  }
}

export function documentedQaAtmContextBinding(row: QaAtmEvidenceBinding): QaAtmContextBinding {
  const evidence = parseQaAtmEvidenceBindings({ version: 1, bindings: [row] })[0]!;
  return {
    atmId: evidence.atmId,
    atmRevision: evidence.atmRevision,
    terminalId: evidence.terminalId,
    endpoint: { ...evidence.endpoint },
    provider: new DocumentedQaBalanceContext(evidence),
  };
}
