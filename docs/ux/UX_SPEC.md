# UX Specification

## Navegacion principal
- Dashboard
- Transacciones
- ATM Profiles
- Tarjetas
- Load Test
- Monitor
- Historial
- Configuracion

## Pantalla Transacciones

Columnas/paneles sugeridos:
1. Contexto: ambiente, escenario, ATM, tarjeta.
2. Operacion: transaccion, monto, cuenta, parametros.
3. Ejecucion: boton enviar, timeline ATM -> SVFE -> Core -> response.
4. Inspector: Parsed / ASCII / HEX / Request vs Response.

## Pantalla Load Test
- transaccion o mix
- total/duracion
- TPS
- numero ATM
- estrategia ATM
- pool tarjetas
- conexiones
- ramp-up
- iniciar/detener

## Realtime
El dashboard debe permanecer util incluso con miles de transacciones; mostrar agregados y solo una ventana de eventos recientes.
