import type { ObservationBatch, ObservationRequest } from '../../packages/domain/src/observations';

export const observationRequest: ObservationRequest = {
  environment: 'PREPROD',
  entityId: 205,
  channelId: 1,
  from: '2026-09-29 00:00:07.803',
  to: '2026-09-29 23:00:07.803',
  terminalId: '',
  transactionCode: '',
  terminalSequence: '',
  returnCode: '',
  limit: 50,
};

export function observationBatch(): ObservationBatch {
  return {
    hasMore: false,
    rows: [
      {
        traceId: (1n << 60n).toString(),
        terminalId: 'ATM22004',
        terminalSequence: '6345',
        occurredAt: '2026-09-29 14:20:00.000',
        transactionCode: '003000',
        messageType: 2,
        returnCode: 16,
        requestStructure:
          '<ExtremeMsg><Header><HField name="AccountNum1">[PROTEGIDO]</HField></Header></ExtremeMsg>',
        responseStructure: '[Mensaje ausente o protegido por longitud]',
      },
    ],
  };
}
