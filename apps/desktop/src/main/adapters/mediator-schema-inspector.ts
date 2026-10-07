import type {
  DestinationCheck,
  DestinationCompatibility,
  DestinationDraftContext,
  DestinationInspector,
} from '../../../../../packages/domain/src/destination-compatibility';

// Evidencia de catalogos SQL leida en PREPROD; no conecta ni consulta datos de negocio.
// MDT_Terminal.trmTerminalId / MDT_Journal.jnlTerminalId: varchar(10).
// MDT_Transaction.trnTrnCode / MDT_Journal.jnlTrnCode: varchar(6).
const source: DestinationCompatibility['source'] = Object.freeze({
  title: 'Esquema Mediator PREPROD',
  environment: 'PREPROD',
  inspectionId: '2bd7c692-6fec-49af-ba15-7f0fb88c0440',
  inspectedAt: '2026-10-07T01:15:14.719Z',
  document: 'docs/core/MEDIATOR_SCHEMA_REVIEW.md',
});

function textCheck(
  id: string,
  label: string,
  value: string | null,
  maximumBytes: number,
): DestinationCheck {
  if (value === null)
    return { id, label, status: 'NOT_CHECKED', description: 'Falta el dato para comparar.' };
  // ASCII coincide en longitud con bytes; la codificacion de otros caracteres no se asume.
  if (!/^[\x20-\x7e]+$/.test(value))
    return {
      id,
      label,
      status: 'NOT_CHECKED',
      description: 'La codificación de caracteres debe validarse antes de comparar bytes.',
    };
  return value.length > maximumBytes
    ? {
        id,
        label,
        status: 'MISMATCH',
        description: `El dato tiene ${value.length} bytes ASCII; Mediator admite ${maximumBytes}. No se trunca.`,
      }
    : {
        id,
        label,
        status: 'MATCH',
        description: `La longitud ASCII cabe en ${maximumBytes} bytes; la configuración habilitada sigue pendiente.`,
      };
}

export class MediatorSchemaInspector implements DestinationInspector {
  assess(context: DestinationDraftContext): DestinationCompatibility | null {
    if (context.environment !== source.environment) return null;
    return {
      source,
      checks: [
        textCheck('TERMINAL_ID', 'Terminal ID', context.terminalId, 10),
        textCheck('OPERATION_CODE', 'Código documental', context.operationCode, 6),
        {
          id: 'ENTITY_CHANNEL_TERMINAL',
          label: 'Entidad, canal y terminal',
          status: 'NOT_CHECKED',
          description:
            'Falta vincular los IDs de Mediator y comprobar la combinación habilitada. El UUID local no sustituye EntityId.',
        },
      ],
    };
  }
}
