# Parametros EMV del terminal QA

## Fuentes recibidas

Consultas aportadas por el usuario el 2026-10-13, vista de Registro 32 bits:
HKLM/SOFTWARE/Wincor Nixdorf/ProTopas/CurrentVersion/EmvDebitCreditFW.

| Dato | Valor normalizado | Fuente |
| --- | --- | --- |
| Capacidades 9F33 | 604020 | TERMINAL_PROPERTIES/TAGS |
| Tipo 9F35 | 14 | TERMINAL_PROPERTIES/TAGS |
| Capacidades adicionales 9F40 | EF80B05010 | TERMINAL_PROPERTIES/TAGS |
| TAC-Online | FF FF FF FF FF | INA recibido |
| TAC-Default | FF FF FF FF FF | INA recibido |
| TAC-Denial | No encontrado | Consulta del Registro |

Cada TAC es opcional; EMV Book 3 10.7 utiliza cinco bytes cero cuando esta
confirmado ausente. No se exige crear TAC_DENIAL ni se afirma que cero este
escrito en el Registro. undefined representa un dato no comprobado y se rechaza.

- [Book 3, 10.7 y anexo A, documento original reproducido](https://studylib.net/doc/28022968/emv-v4.3-book-3-application-specification-20120607062110791).
- [Book 4, anexo A, tipo 14 online-only, documento original reproducido](https://pciwatch.org/emvco/13283/book-4-cardholder-attendant-and-acquirer-interface-requirements/).

## Implementacion

parseQaEmvTerminalParameters en Main valida anchos 3/1/5, normaliza octetos
del Registro y rechaza PROD, parametros extras, datos no comprobados y tipos
fuera del alcance QA tipo 14. No lee Registro ni abre sockets.

analyseQaOnlineAtm recibe TVR calculado por el procesamiento real y primero
compara las condiciones de rechazo TAC/IAC-Denial. Solicita AAC si coinciden;
de lo contrario solicita ARQC por ser online-only. Tras fallo online elige
la opcion documentada de solicitar AAC sin procesamiento Default, sin aprobar
offline. Su resultado es una decision previa al comando, no una autorizacion.

READ RECORD obtiene ahora IAC-Denial 9F0E, IAC-Online 9F0F e IAC-Default 9F0D.
Valida cinco bytes y entrega flags estaticos o null para tags ausentes;
una lectura incompleta no entrega issuerActionCodes. No expone PAN completo,
PIN, PIN Block, IAD o criptogramas. Los IAC de otra tarjeta no se reutilizan.

El perfil privado artifacts/qa-diebold-emv-profile.partial.json incorpora la
revision 348fa7c9-b125-44dc-a5cf-8d9be1dcbcf8. Conserva antes/revision bajo
artifacts, sin cambios en SQL/Registro/cajero. publicTerminalParametersReceived
no habilita el proveedor financiero ni demuestra capacidades implementadas
en el OMNIKEY. applicationContextProviderConfigured=false y
newPhysicalTransactionsEnabled=false permanecen vigentes.

## Verificacion y limites

Relectura solicitada por el usuario con tarjeta presente, 2026-10-13
16:55:13-20 UTC (11:55 Ecuador), runId 50147b00-f616-4cc3-8bd5-ba7113643876:
READ con tarjeta enmascarada terminada en 2267, CDOL1/CDOL2 e IAC reales:
Denial 2410280000, Online 9868D4F800, Default 9868C4A800. No se asigna TVR
por suposicion ni se ejecuta GENERATE AC. La ausencia de tarjeta descrita
mas abajo corresponde al intento anterior, no a esta lectura.

Inspeccion de disponibilidad del servicio Main con el proveedor ausente que
figura en index.ts: ready=false. Diagnostico
55691c9e-4479-4f13-97c6-a4f15a3737fe; no ejecuta consulta de la aplicacion,
no vincula catalogo, adquiere contexto, escribe diario o abre sockets. Reporte
privado artifacts/fresh-balance-readiness-55691c9e-4479-4f13-97c6-a4f15a3737fe.json.
La lectura fisica es exitosa; generacion PIN/EMV/contexto siguen sin integrar.

npm run check exitoso: 533 pruebas unitarias y 111 de integracion (644),
formato, lint, tipos, seguridad y build. Las pruebas de analisis ejercitan
decision previa al criptograma; no certifican un kernel completo ni autorizacion.

Pruebas de parametrizacion, IAC de registros sinteticos, prioridad de rechazo,
decision online, fallo online, ausencia de TAC y validacion de datos. El
analisis no tiene dependencias externas; la lectura PC/SC conserva sus plazos.

Lectura fisica intentada el 2026-10-13 16:17:03-05 UTC (11:17 Ecuador), runId
8f8d0afc-a89d-41a4-8089-292da37f28d2: CONTACT_CARD_NOT_PRESENT. Cero APDU,
verificaciones PIN, GENERATE AC y envios financieros. No se reemplazan IAC
no leidos o TVR no calculado con datos de captura. TVR/CVM, GENERATE AC,
cifrador PIN TEST y contexto ATM siguen pendientes de integracion.
