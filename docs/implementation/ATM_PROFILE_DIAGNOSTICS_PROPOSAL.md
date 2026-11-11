# Propuesta: diagnóstico del perfil ATM

Fecha: 2026-11-10. Estado: análisis; el diagnóstico completo no está implementado.

Actualización 2026-11-11: se implementa el diagnóstico acotado a alta y prueba
de saldo QA/205 mediante el asistente de [ADR-042](../adr/ADR-042-QA-ATM-ONBOARDING.md).
Incluye identidad/plantilla/destino, plazos, seguridad y pool, sin efectos
financieros durante la inspección. El diagnóstico de contratos de todas las
operaciones y un estado persistente de disponibilidad permanecen propuestos.
Las referencias siguientes al diagnóstico pendiente corresponden a la propuesta
original de alcance general.

## Problema y valor

Un ATM puede estar activo en el catálogo y no estar disponible para operar:
entidad inactiva, plantilla o perfil privado ausente, destino incompatible,
contrato de operación pendiente o reservas agotadas. El operador descubre
estos motivos después de preparar una transacción. Además, crear otro ATM
no crea nuevas reservas: los derivados comparten el pool de ATM20521.

Proponemos **Ver diagnóstico** desde cada fila para identificar el siguiente
paso local sin iniciar una transacción. Es prioritario frente a altas masivas:
crear muchos terminales sin visibilidad de sus requisitos amplifica la confusión
y no acredita su alta en el switch.

## Evidencia del repositorio

- [Catálogo](LOCAL_CATALOGS.md): DRAFT y active son propiedades administrativas;
  las revisiones previenen sobrescrituras concurrentes.
- [Plantilla vigente](MULTI_ATM_PROFILES.md) y
  [ADR-024](../adr/ADR-024-REUSABLE-ATM-TEMPLATE.md): QA/205, prioridad del
  perfil específico, herencia y pool compartido.
- `apps/desktop/src/main/qa-atm-template.ts`: `snapshot` comprueba entidad,
  revisión, terminal y destino; `resolve` conserva la validación antes de reservar.
- `packages/domain/src/balance-inquiry.ts`: `BalanceReadiness` ya representa
  bloqueos y reservas, pero está ligado a una preparación transaccional.
- [Arquitectura](../../ARCHITECTURE.md): Main conserva archivos privados,
  claves, conexiones y verificaciones previas al envío.

## Experiencia propuesta

Un panel muestra alias, terminal, entidad y revisión, seguido de comprobaciones
separadas: catálogo, origen de configuración, compatibilidad del destino,
operaciones configuradas y reservas compartidas. Cada comprobación tiene
estado **Verificado localmente**, **Requiere acción** o **No comprobado**,
motivo público y acción concreta: editar perfil, revisar entidad o ir a
Configuración. Mostrar instante de consulta y botón **Actualizar diagnóstico**.

El panel distingue requisitos de tarjeta/PIN de configuración del terminal.
No solicita PIN, no lee el chip, no reserva STAN y no conecta al host.
No incluye un indicador genérico «Listo» que pueda confundirse con aceptación
financiera. La aceptación remota permanece **No comprobada** salvo evidencia
específica y vigente definida por una futura fuente aprobada.

## Implementación propuesta

1. Extraer una inspección local de configuración detrás de un puerto de Main;
   reutilizar las verificaciones existentes sin invocar `reserve` ni `acquire`.
2. Definir contrato público con UUID/revisión ATM, revisión de configuración,
   timestamp UTC, origen explícito/heredado y resultados sanitizados.
   Nunca exponer rutas privadas, referencias de claves, KCV ni campos ISO crudos.
3. Agregar IPC validado con QA, emisor y revisión actuales. Una respuesta tardía
   del perfil anterior se descarta al cambiar selección o cerrar el panel.
4. Consultar a demanda. Un error/timeout muestra «No comprobado» y permite
   actualizar; no conservar una marca verde de una consulta anterior.
5. Mantener todas las verificaciones antes del envío; el diagnóstico es una
   instantánea informativa y nunca un permiso de ejecución.

Complejidad estimada: media, por separar la inspección del contexto de tarjeta
y mantener las verificaciones coherentes con el motor. No requiere dependencia
nueva ni cambio del esquema del catálogo para una primera versión sin historial.
Un ADR deberá formalizar el nuevo contrato cuando se implemente.

## Criterios de aceptación

- Caso válido: distingue perfil específico de heredado y muestra pool compartido.
- Entradas: rechaza UUID, revisión o ambiente inválidos; producción sigue bloqueada.
- Error: entidad inactiva, archivo ausente/corrupto, destino incompatible y pool
  agotado producen motivos verificables, sin inventar reglas de host.
- Dependencia no disponible/timeout: estado desconocido recuperable, sin secretos.
- Concurrencia: editar/desactivar un perfil invalida la instantánea; una respuesta
  tardía no reemplaza la del ATM recién seleccionado.
- Ausencia de efectos: pruebas espía e integración verifican cero reservas,
  escrituras financieras, solicitudes PIN, APDU y conexiones TCP.
- E2E: teclado, lectura de errores, actualización y retorno al catálogo.

## Datos pendientes y entrega actual

Se conserva **TODO-DATA MULTI-ATM-QA-RESULT** de la guía vigente: la admisión
remota de nuevos terminales requiere evidencia QA aprobada. Solo bloquea la
afirmación de aceptación remota; no el diagnóstico local. No se deduce fecha
contable efectiva, nuevas operaciones o reglas ISO a partir del catálogo.

Esta entrega implementa la base administrativa: resumen, búsqueda ampliada,
filtros, advertencias de entidad inactiva y duplicados. El panel, su IPC y la
inspección de configuración descritos arriba quedan propuestos para otra entrega.
