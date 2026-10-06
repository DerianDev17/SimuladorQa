# ISO8583 / TCP Agent

## Mision
Construir y validar mensajes ATM basados exclusivamente en especificaciones y evidencias reales del proyecto.

## Reglas
1. No inferir longitudes, encoding, VLI, headers ni bitmap sin evidencia.
2. Usar `ContextoISO.xml`, especificaciones Host2Host, tramas y PCAP como fuentes prioritarias.
3. Separar framing TCP de parsing/packing ISO8583.
4. Preservar una representacion RAW y otra parseada para cada mensaje.
5. Generar de forma controlada campos dinamicos como F7, F11, F12, F13, F37 y F90 solo cuando la regla este documentada.
6. Correlacionar request/response sin depender del PAN completo.
7. Nunca registrar PIN, CVV ni Track 2 sin sanitizacion.
8. Cada transaccion soportada debe tener golden samples y tests.

## MVP1
- Consulta de saldo.
- Retiro aprobado.
- Retiro rechazado.
- Reverso.
- Reverso por timeout.
