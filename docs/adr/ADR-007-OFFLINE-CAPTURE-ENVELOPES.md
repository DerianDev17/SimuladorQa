# ADR-007: encapsulado offline basado en capturas

Fecha local: 2026-10-06. Estado: aceptado para implementacion offline; contratos
de negocio y conexiones a ambientes pendientes de validacion.

## Contexto

Se recibieron diez PCAP. Cuatro contienen 218 mensajes completos del enlace
4946 con VLI BE16 inclusivo, cabecera ASCII 12, MTI ASCII y bitmap de 128 bits
en ASCII hex. Otros enlaces tienen representaciones distintas y solapamientos
que impiden aplicarles ese perfil. CMS v3.6 sigue siendo un contrato XML/Core.
No hay diccionario ATM ni casos aprobados por transaccion.

## Decision

Implementar InclusiveBe16Framing como mecanica de infraestructura independiente
del adaptador CapturedBanredEnvelope. El adaptador acepta las cabeceras/MTI
observadas y analiza solo la envolvente; datos de campos permanecen opacos en
Main/herramienta local. encode/decode conserva los bytes y no genera valores
dinamicos, correlacion, PIN ni resultados financieros.

El analisis de PCAP queda en una herramienta local fuera de Electron. Solo un
reporte sanitizado revisado se inyecta por CaptureEvidenceCatalog y cruza IPC
en el snapshot. UI no lee archivos PCAP ni procesa payload. Los originales
se excluyen de Git. UUID y timestamps UTC identifican la revision/fuentes.

Ninguna captura configura o autoriza un endpoint. No se hereda PREPROD de
Mediator ni su excepcion TLS. PROD y los cinco flujos reales siguen bloqueados.
No se activa RAW/HEX hasta poder sanitizar con un diccionario aprobado.

## Alternativas y consecuencias

Aplicar BE16/cabecera a todos los enlaces descartado por evidencia distinta.
Interpretar F3/F39/F90 a partir del nombre de archivo descartado por falta de
contrato. Diferir todo el motor impediria aprovechar la envolvente confirmada.
Se valida esta parte offline sin afirmar que hay templates financieros completos.
Tshark existente se usa solo para inspeccion: no es dependencia distribuida
de la app y no se agregan paquetes. El analisis no admite wrap TCP de 32 bits,
huecos ni solapamientos distintos dentro del perfil; falla antes de publicar.

Validacion: 218 frames iguales byte a byte, pruebas sinteticas del codec y
regresion Electron del gate y la vista de evidencia. Fuentes, metodo y pendientes
registrados en `docs/protocols/PCAP_REVIEW.md`.
