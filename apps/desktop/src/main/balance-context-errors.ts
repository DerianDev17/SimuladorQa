// Only fixed public diagnoses may cross IPC or enter the execution journal.
// Never include the dependency's error text, PIN, card fields or APDU response.
export const balanceContextErrorLabels: Readonly<Record<string, string>> = {
  QA_TEMPLATE_UNAVAILABLE:
    'No está disponible la plantilla ATM20521 para esta entidad y destino QA',
  QA_TEMPLATE_ATM_INVALID:
    'Recarga un ATM activo de la entidad 205, con Terminal ID de ocho caracteres y Acquirer ID numérico de hasta once dígitos',
  QA_WITHDRAWAL_POLICY_MISSING:
    'Falta cargar el contrato de retiro de este ATM en qa-withdrawal-policies.json (EMV, montos permitidos y tratamiento de resultados)',
  QA_WITHDRAWAL_POLICY_INVALID:
    'La configuración de retiro es inválida. Revisa qa-withdrawal-policies.json',
  QA_WITHDRAWAL_POLICY_UNAVAILABLE:
    'No se pudo leer la configuración de retiro. No se envió el retiro',
  QA_WITHDRAWAL_POLICY_CHANGED:
    'Cambió el contrato o el perfil vinculado al retiro. Revisa su validación antes de enviar',
  QA_WITHDRAWAL_AMOUNT_NOT_ALLOWED:
    'El monto no está incluido entre los importes de prueba aprobados para este ATM',
  QA_PIN_CANCELLED: 'Se canceló la entrada del PIN. No se envió la transacción',
  QA_PIN_TIMEOUT: 'Se agotó el tiempo para ingresar el PIN. No se envió la transacción',
  QA_PIN_UNAVAILABLE:
    'No se pudo completar la entrada o el cifrado del PIN. No se envió la transacción',
  QA_PROFILE_CHANGED: 'Cambió el perfil QA aprobado. Recarga el perfil antes de intentar de nuevo',
  QA_SEQUENCE_UNAVAILABLE:
    'No se pudo reservar una secuencia QA disponible. No se envió la transacción',
  QA_CARD_SESSION_UNAVAILABLE:
    'La sesión de la tarjeta dejó de estar disponible. Vuelve a leer la tarjeta',
  QA_CARD_SESSION_TIMEOUT: 'El lector no respondió a tiempo. Vuelve a leer la tarjeta',
  QA_CARD_PROFILE_UNSUPPORTED:
    'Los datos de la tarjeta no corresponden al perfil QA aprobado. Revisa la tarjeta seleccionada',
  QA_EMV_PROFILE_UNSUPPORTED:
    'No se pudieron preparar los datos EMV requeridos por el perfil QA. No se envió la transacción',
  QA_EMV_COMMAND_REJECTED: 'El chip no completó la generación EMV. Vuelve a leer la tarjeta',
  QA_EMV_CARD_DECLINED: 'La tarjeta rechazó la generación EMV. No se envió la transacción',
  QA_EMV_FIELD_LENGTH_INVALID:
    'Los datos EMV exceden la longitud admitida por el formato QA. No se envió la transacción',
  CONTEXT_CHANGED:
    'La configuración cambió durante la preparación. Recarga antes de intentar de nuevo',
  CONTEXT_TIMEOUT:
    'La preparación de la transacción agotó su tiempo de espera. No se envió la transacción',
};
