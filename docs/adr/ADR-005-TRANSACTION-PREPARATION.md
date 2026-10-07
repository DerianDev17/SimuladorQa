# ADR-005: preparacion transaccional con catalogo documental

Estado: aceptado para preparacion local. Fecha: 2026-10-06.

## Contexto

El usuario autoriza seguir Extreme Mediator CMS v3.6 sobre los ejemplos del
mockup. El manual documenta operaciones/cuentas, pero faltan el diccionario ATM,
fixtures y mapeos de transporte, resultados y reversos. Se necesita avanzar en
la pantalla sin convertir una referencia documental en una ejecucion autorizada.

## Decision

- Crear OperationCatalog en dominio con metadatos de operacion, cuenta y fuente.
- Implementar CmsV36Catalog en Main como adaptador inyectado, sin red ni nuevas
  dependencias. Renderer recibe metadatos mediante el snapshot existente.
- Agregar IPC especifico de revision de borrador con campos exactos, QA/PREPROD,
  UUID/revision de ATM, cuenta y monto string. Main revalida contra SQLite Worker
  vigente y preferencias; el Renderer no accede a almacenamiento ni secretos.
- Mantener DraftReview en BLOCKED. La revision es de lectura y no crea una
  ejecucion, runId, STAN/RRN, debito Core, mensaje ISO ni RC.
- Conservar el contrato de revision simple usado por el dashboard; la pantalla
  de transacciones utiliza la revision de contexto completa.
- Limitar ahorros/corriente en esta entrega. Credito/universal, consulta impresa
  y otras operaciones del manual requieren templates y alcance aprobados.
- Separar validacion sintactica decimal de elegibilidad financiera. El limite
  tecnico de 11 digitos enteros no se considera una regla ATM/ISO ni del Core.

## Consecuencias

La UI y el catalogo documental son verificables sin inventar tramas. Las futuras
implementaciones de ISO, TCP, Core y tarjetas tendran sus propios puertos y
gates basados en evidencia; no podran utilizar un borrador como perfil validado.
Las pestañas RAW/HEX permanecen vacias hasta disponer de evidencia sanitizada.
El checklist distingue desarrollo local completado de datos/QA pendientes.

Pruebas y limites: `docs/implementation/TRANSACTION_PREPARATION.md`.
