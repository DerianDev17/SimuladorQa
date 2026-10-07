# TCP Framing

El manual Extreme Mediator CMS v3.6 describe API REST/XML Mediator-Core (p. 4).
No confirma el VLI/header ni autoriza el endpoint TCP de referencia siguiente.
Ver [revision CMS](EXTREME_MEDIATOR_CMS_REVIEW.md). No combinar ambos transportes.

## Base conocida

Material previo indica como referencia inicial:

- TCP.
- VLI: 2 bytes.
- Cabecera: 12 bytes.
- Mensaje 0200 -> 0210.
- Conexion persistente.
- Endpoint de referencia previamente documentado: `172.20.33.116:4946` para un flujo BANRED de prueba.

## Pendiente de confirmar

Actualizacion 2026-10-07: el usuario aporto entrada ATM SmartVista 16100,
enlace SmartVista/Mediator 49212, roles de hosts y PID/netstat. Confirmo QA
para todos esos enlaces y ejecucion del simulador desde su PC. Configuracion
muestra evidencia documental por ambiente. Ver
[evidencia de red](../implementation/SWITCH_NETWORK_EVIDENCE.md).
El PID muestra longitud de encabezado 2 y keep alive habilitado; no define por
si solo encoding, inclusion del prefijo ni contenido de cabecera de negocio.
El framing del enlace 16100 sigue sin validarse con un stream completo.

Por escenario/ambiente:

- acceso al host/puerto ATM QA recibido desde la PC/PID; otros endpoints por escenario;
- encoding del VLI;
- inclusion/exclusion de VLI dentro de la longitud;
- contenido de header;
- TLS;
- keepalive;
- timeout;
- reconnect;
- max inflight messages por conexion.

El motor debe hacer framing mediante estrategia configurable, no hardcodeada.

## Evidencia recibida e implementacion offline

Diez PCAP recibidos; cuatro contienen 218 mensajes completos del enlace 4946.
Confirman VLI de 2 bytes big endian **incluido** en la longitud, cabecera de 12
bytes, MTI ASCII y bitmap ASCII hex de 128 bits. `InclusiveBe16Framing` separa
transporte de `CapturedBanredEnvelope`; soporta fragmentacion y concatenacion,
rechaza longitud invalida y detecta fuente incompleta al finalizar.
Ver [revision PCAP](PCAP_REVIEW.md) para hashes, variantes y comprobacion byte a byte.

Estos puntos dejan de estar pendientes para ese enlace capturado. Ambiente,
autorizacion, TLS, timeout, reconexion y los otros perfiles siguen pendientes.
El endpoint previo es solo referencia; no se crea ninguna conexion TCP.
