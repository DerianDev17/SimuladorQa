# Perfiles de tarjeta

## Objetivo
Permitir pruebas reproducibles con o sin tarjeta fisica.

## Modelo
- cardProfileId
- alias
- entityId
- panEncrypted
- panMasked
- bin
- expiry
- product
- accountType
- network
- track2Encrypted (solo si es imprescindible)
- pinConfigured (boolean)
- active
- tags

## Importacion
Prever importacion CSV controlada y validada.

## UI
El usuario ve alias, entidad, producto, PAN enmascarado y estado. El PAN completo no se muestra por defecto.
