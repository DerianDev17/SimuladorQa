import { open } from 'node:fs/promises';
import { isIPv4 } from 'node:net';
import { isRecord } from '../../../../../packages/domain/src/index';
import { isRevision, isUtcTimestamp, isUuid } from '../../../../../packages/domain/src/catalogs';
import type { BalanceReadiness } from '../../../../../packages/domain/src/balance-inquiry';
import type { BalanceContextLease, BalanceContextProvider } from '../balance-ports';
import type { QaAtmContextBinding } from '../qa-balance-context-router';

// A CMS terminal master key is not the PIN key for a direct Switch connection.
// This snapshot records a comparison performed outside Renderer. It contains
// no components, KCV, key bytes or financial/card data, and cannot execute TCS.
export interface QaCmsAtmEvidence {
  id: string;
  environment: 'QA';
  entityCode: '205';
  atmId: string;
  atmRevision: number;
  terminalId: string;
  senderEndpoint: { host: string; port: number };
  tcsEndpoint: { host: string; port: number };
  sourceEndpoint: { host: string; port: number };
  imageId: number;
  componentIds: [number, number];
  masterCheckMatched: boolean;
  hostKeyChangePending: boolean;
  verifiedAt: string;
  masterKeyCustody?: {
    keyReference: string;
    networkCheckMatched: boolean;
    protectedAt: string;
  };
}

const fields = [
  'id',
  'environment',
  'entityCode',
  'atmId',
  'atmRevision',
  'terminalId',
  'senderEndpoint',
  'tcsEndpoint',
  'sourceEndpoint',
  'imageId',
  'componentIds',
  'masterCheckMatched',
  'hostKeyChangePending',
  'verifiedAt',
];
function exact(value: Record<string, unknown>, names: string[]): boolean {
  return (
    Object.keys(value).length === names.length && names.every((name) => Object.hasOwn(value, name))
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
export function parseQaCmsAtmEvidence(input: unknown): QaCmsAtmEvidence[] {
  const invalid = () => {
    throw Error('QA_CMS_ATM_EVIDENCE_INVALID');
  };
  if (
    !isRecord(input) ||
    !exact(input, ['version', 'bindings']) ||
    input.version !== 1 ||
    !Array.isArray(input.bindings) ||
    input.bindings.length > 50
  )
    return invalid();
  const ids = new Set<string>(),
    atms = new Set<string>();
  for (const row of input.bindings) {
    if (
      !isRecord(row) ||
      !exact(
        row,
        Object.hasOwn(row, 'masterKeyCustody') ? [...fields, 'masterKeyCustody'] : fields,
      ) ||
      row.environment !== 'QA' ||
      row.entityCode !== '205' ||
      !isUuid(row.id) ||
      !isUuid(row.atmId) ||
      !isRevision(row.atmRevision) ||
      typeof row.terminalId !== 'string' ||
      !/^[A-Z0-9]{8}$/.test(row.terminalId) ||
      !endpoint(row.senderEndpoint) ||
      !endpoint(row.tcsEndpoint) ||
      !endpoint(row.sourceEndpoint) ||
      !Number.isSafeInteger(row.imageId) ||
      Number(row.imageId) < 1 ||
      Number(row.imageId) > 65535 ||
      !Array.isArray(row.componentIds) ||
      row.componentIds.length !== 2 ||
      row.componentIds.some((id) => !Number.isSafeInteger(id) || id < 1 || id > 2147483647) ||
      row.componentIds[0] === row.componentIds[1] ||
      typeof row.masterCheckMatched !== 'boolean' ||
      typeof row.hostKeyChangePending !== 'boolean' ||
      !isUtcTimestamp(row.verifiedAt) ||
      (Object.hasOwn(row, 'masterKeyCustody') &&
        (!isRecord(row.masterKeyCustody) ||
          !exact(row.masterKeyCustody, ['keyReference', 'networkCheckMatched', 'protectedAt']) ||
          !isUuid(row.masterKeyCustody.keyReference) ||
          typeof row.masterKeyCustody.networkCheckMatched !== 'boolean' ||
          !isUtcTimestamp(row.masterKeyCustody.protectedAt))) ||
      ids.has(row.id) ||
      atms.has(row.atmId)
    )
      return invalid();
    ids.add(row.id);
    atms.add(row.atmId);
  }
  return structuredClone(input.bindings) as QaCmsAtmEvidence[];
}

export class FileQaCmsAtmEvidence {
  constructor(private readonly path: string) {}
  async read(): Promise<QaCmsAtmEvidence[]> {
    const file = await open(this.path, 'r');
    const buffer = Buffer.alloc(65537);
    try {
      if ((await file.stat()).size > 65536) throw Error('QA_CMS_ATM_EVIDENCE_INVALID');
      const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
      if (bytesRead > 65536) throw Error('QA_CMS_ATM_EVIDENCE_INVALID');
      return parseQaCmsAtmEvidence(JSON.parse(buffer.subarray(0, bytesRead).toString('utf8')));
    } catch {
      throw Error('QA_CMS_ATM_EVIDENCE_INVALID');
    } finally {
      buffer.fill(0);
      await file.close();
    }
  }
}

class CmsAtmContext implements BalanceContextProvider {
  constructor(private readonly row: QaCmsAtmEvidence) {}
  async inspect(): Promise<BalanceReadiness> {
    const row = this.row;
    const master = row.masterCheckMatched
      ? 'Maestra CMS verificada.'
      : 'Maestra CMS sin verificar.';
    const custody = row.masterKeyCustody ? ' Guardada con protección de Windows.' : '';
    const directKey =
      row.masterKeyCustody?.networkCheckMatched === false
        ? ' No coincide con la llave PIN del enlace.'
        : ' Llave PIN del enlace sin vincular.';
    return {
      ready: false,
      blockers: [
        {
          id: 'QA-DIRECT-PIN-KEY-BINDING',
          label: `${row.terminalId} → ${row.senderEndpoint.host}:${row.senderEndpoint.port}. ${master}${custody}${directKey} Falta vincular el cifrado del PIN nuevo`,
        },
        {
          id: 'QA-EXECUTION-PROFILE-BINDING',
          label:
            'La ruta directa requiere un perfil de ejecución con formato PIN validado, secuencia propia y fecha contable vinculada. La evidencia CMS queda conservada',
        },
      ],
    };
  }
  async acquire(): Promise<BalanceContextLease> {
    throw Error('QA_DIRECT_PIN_CONTEXT_NOT_BOUND');
  }
}

export function documentedCmsAtmContextBinding(row: QaCmsAtmEvidence): QaAtmContextBinding {
  const evidence = parseQaCmsAtmEvidence({ version: 1, bindings: [row] })[0]!;
  return {
    atmId: evidence.atmId,
    atmRevision: evidence.atmRevision,
    terminalId: evidence.terminalId,
    // TCS source/listener and host key-change state belong to the terminal
    // route. They are retained as evidence, never prerequisites for direct ISO.
    endpoint: { ...evidence.senderEndpoint },
    provider: new CmsAtmContext(evidence),
  };
}
