# Estrategia de pruebas del producto

## Unitarias
- bitmap
- codecs
- generators
- validators
- scenario classifier
- percentile calculations

## Integracion
- ISO builder/parser roundtrip
- TCP framing
- reconnect/timeout
- SQLite
- PC/SC adapter con stub y hardware real
- SmartVista/Core adapters con entornos QA

## Contract tests
Guardar ejemplos de request/response reales sanitizados y verificar byte-level output cuando aplique.

## E2E
- abrir app
- seleccionar ATM/tarjeta
- enviar consulta
- recibir respuesta
- validar inspector
- guardar resultado

## Performance del simulador
Medir CPU/RAM del agente para separar degradacion del simulador de degradacion del Switch.

## Regression
Cada bug transaccional debe agregar fixture + test reproducible cuando sea posible.
