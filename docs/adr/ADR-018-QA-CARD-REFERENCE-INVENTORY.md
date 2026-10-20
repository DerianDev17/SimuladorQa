# ADR-018: Inventario QA de referencias de tarjeta

- Estado: Aceptado
- Fecha: 2026-10-20

## Contexto

El equipo necesita reconocer las tarjetas fisicas QA que se usan en el lector.
La lectura del chip expone identidad temporal para la operacion actual, pero
guardar credenciales de pago aumentaria la superficie de riesgo y no permitiria
generar una transaccion nueva sin el chip presente.

## Decision

La aplicacion guarda un perfil de referencia en `qa-card-profiles.json` dentro
de `userData`, solo en QA. El operador define un alias. Main valida que la
lectura indicada siga activa en PC/SC y conserva solo alias, ultimos cuatro,
AID, UUID y fecha UTC. El archivo se limita a 100 registros y se actualiza de
forma atomica.

El inventario no guarda PAN completo, nombre, vencimiento, Track 2, PIN,
PIN Block, CVV, respuestas APDU ni criptogramas. Los perfiles guardados no se
aceptan como identidad para el envio transaccional: cada operacion requiere
volver a insertar y leer la tarjeta y obtener seguridad nueva del chip.

## Consecuencias

- QA puede etiquetar y reconocer tarjetas fisicas entre sesiones.
- PREPROD no puede listar, crear o eliminar perfiles de referencia.
- El inventario no proporciona el pool virtual ni el motor de carga.
- Un perfil con PAN u otros datos sensibles requeriria una arquitectura y
  aprobacion de almacenamiento distintas; no forma parte de esta decision.
