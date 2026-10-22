# HID OMNIKEY 5422

Para implementar este patrón en otro proyecto con Python o C++, ver la
[guía de portabilidad PC/SC](GUIA_PORTABILIDAD_PCSC_PYTHON_CPP.md), con diagramas,
ejemplos de diagnóstico, límites de seguridad y matriz de pruebas.

## Integracion

Usar PC/SC en Windows mediante un adaptador desacoplado del dominio.

## Capacidades esperadas de la app
- detectar reader disponible;
- detectar tarjeta insertada/acercada;
- leer ATR/ATS y datos permitidos;
- detectar retiro;
- asociar tarjeta a un perfil de prueba;
- mostrar PAN enmascarado cuando se disponga;
- mostrar entidad/BIN/perfil resuelto.

## Nota
El reader se usara como fuente fisica de identidad/datos disponibles; cualquier dato ATM que no pueda obtenerse de la tarjeta se completa desde el perfil configurado.

## Seguridad
No persistir datos sensibles brutos obtenidos del lector salvo necesidad documentada y siempre cifrados/enmascarados.
