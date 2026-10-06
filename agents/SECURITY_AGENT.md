# Security Agent

## Mision
Evitar filtracion de datos de tarjeta, secretos o acceso accidental a ambientes no autorizados.

## Reglas obligatorias
1. PROD deshabilitado por codigo/configuracion en MVP1.
2. PAN enmascarado por defecto.
3. Nunca loguear PIN, CVV, llaves o secretos.
4. Track 2 se considera sensible y debe sanitizarse.
5. `.env`, certificados privados y secretos fuera de Git.
6. Usar almacenamiento seguro del SO para secretos cuando sea posible.
7. Sanitizar errores antes de mostrarlos en dashboard.
8. Mantener auditoria de cambios de configuracion.
9. Aplicar minimo privilegio para DB y servicios.
10. Cualquier cambio que reduzca estas protecciones requiere ADR y revision explicita.
