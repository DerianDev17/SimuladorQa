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

Por escenario/ambiente:

- host/IP;
- puerto;
- encoding del VLI;
- inclusion/exclusion de VLI dentro de la longitud;
- contenido de header;
- TLS;
- keepalive;
- timeout;
- reconnect;
- max inflight messages por conexion.

El motor debe hacer framing mediante estrategia configurable, no hardcodeada.
