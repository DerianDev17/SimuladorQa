# Correcciones prioritarias del envío financiero — 2026-11-09

## Fallos reproducidos

1. El motor solo instalaba la revalidación al escribir cuando recibía un
   coordinador de carga. Una operación manual podía conectar con un contexto
   que había cambiado o caducado desde la validación anterior al transporte.
   El adaptador de retiro con reverso tampoco ejecutaba ese permiso.
2. El transporte común permitía que dos invocaciones del callback de escritura
   enviaran dos veces el mismo original. La regresión TCP local reprodujo
   1.072 bytes para una trama sintética de 536 bytes.

Ambos son controles locales exigidos por la arquitectura y el contrato existente
de envío único. No se han observado ni se atribuyen duplicados a un host real.
Fuentes: [arquitectura](../../ARCHITECTURE.md),
[retiro](../transactions/WITHDRAWAL.md) y [reverso](../transactions/REVERSAL.md).

## Comportamiento corregido

- El motor instala siempre el permiso de escritura. Tras conectar y después de
  cualquier espera del coordinador, revalida el proveedor, el contexto, la vigencia,
  la cancelación y el plazo de carga cuando existe. Un error o timeout de validación
  impide escribir; no se reintenta la solicitud.
- Saldo, retiro y depósito comparten la protección de una sola escritura en el
  transporte común. El flujo de retiro con reverso también limita a uno su 0200.
- El retiro con reverso espera el permiso antes del original y comienza el timeout
  de respuesta al escribir. Cancelar durante la validación cierra TCP; un permiso
  tardío no puede escribir después del cierre.
- Una respuesta 0210 recibida antes de transmitir el original no lo aprueba ni
  programa un reverso. El 0420 mantiene su contrato de aprobación y persistencia;
  no se somete a una segunda preparación de tarjeta ni se cambian sus campos.

Se conservan los registros, la idempotencia, las máscaras y el bloqueo de PROD.
No se cambian códigos de respuesta, reglas ISO/PIN/EMV ni políticas financieras.
No hace falta un nuevo TODO-DATA para restaurar estos controles ya documentados.

## Regresiones

- Motor: contexto válido, cambiado, caducado, proveedor no disponible y timeout
  durante la validación al escribir; diario sanitizado y misma referencia sin reenvío.
- TCP local: doble permiso produce una sola trama y conserva el timeout sin respuesta.
- Retiro con reverso: rechazo al validar, cancelación con permiso tardío, respuesta
  prematura y aprobación fragmentada; un permiso duplicado no duplica el original
  ni el reverso y la validación no consume el timeout de respuesta.

Todas las pruebas utilizan dependencias sintéticas y TCP loopback. No acreditan
aceptación ni capacidad de Switch/Core y no requieren operaciones reales QA/PREPROD.

Validación final: 1.132 pruebas unitarias y 298 de integración correctas; formato,
lint, TypeScript strict, chequeo de secretos y build correctos. Se comprobaron
siete recorridos Electron: depósito, carga con dos ATM, exclusión de segunda
instancia, retiro con reverso, retiro, saldo y recuperación tras timeout.
En la primera ejecución pasaron seis; el de carga agotó una aserción de 5 s,
igual al intervalo documentado de sondeo en reposo. Se dio margen de 10 s a esa
aserción para incluir IPC/renderizado y el recorrido pasó al repetirlo.
No se modificó el intervalo del producto ni se ejecutó toda la suite Electron.
