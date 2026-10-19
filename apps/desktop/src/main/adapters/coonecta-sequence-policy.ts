// ATMIso8583.GenerarTransaccion initializes secuencialNet from Param.Serial.
// GetSecuenciaXTipoTarjeta returns unchanged for GrabaAutoTran=N, or for a BIN
// found in ATMBIN. Only its remaining branch calls sp_DebGetNextSeq.
// This selects a documented source; it does not allocate serials or invent rollover.
export type CoonectaSequenceDecision =
  | { source: 'ATM_SERIAL'; sequence: number }
  | { source: 'BIN_LOOKUP_REQUIRED' }
  | { source: 'EXTREME_SEQUENCE_REQUIRED' };

export function selectCoonectaSequence(input: {
  autoJournal: 'N' | 'S';
  atmSerial: number;
  binRegistered: boolean | null;
}): CoonectaSequenceDecision {
  if (
    !input ||
    !['N', 'S'].includes(input.autoJournal) ||
    !Number.isInteger(input.atmSerial) ||
    input.atmSerial < 1 ||
    input.atmSerial > 999999 ||
    (input.binRegistered !== null && typeof input.binRegistered !== 'boolean')
  )
    throw Error('COONECTA_SEQUENCE_CONTEXT_INVALID');
  if (input.autoJournal === 'N' || input.binRegistered === true)
    return { source: 'ATM_SERIAL', sequence: input.atmSerial };
  if (input.binRegistered === null) return { source: 'BIN_LOOKUP_REQUIRED' };
  return { source: 'EXTREME_SEQUENCE_REQUIRED' };
}
