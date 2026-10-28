# ADR-028: reutilizar procesos durante la preparación de carga

Fecha: 2026-10-28. Estado: implementado; caudal real pendiente de validación QA.

## Problema y evidencia

El usuario muestra una corrida de ambos ATM con objetivo 3 TPS, 8 envíos,
8 aprobaciones y 91 segundos: 0,09 TPS. La concurrencia de ADR-027 permite
esperas TCP simultáneas, pero no alimenta el transporte al ritmo solicitado.
Lectura, validación de perfil y PIN/EMV/contexto suman 80.353 ms para ocho
operaciones. El contexto también incluye la captura inicial del PIN; la captura
no aísla cuánto consume cada llamada interna. Los 175.774 ms de espera del
lector son esperas superpuestas de slots; no se suman a la duración de pared.

El código abría PowerShell en cada comprobación DPAPI/cifrado y volvía a crear
el proceso PC/SC (incluida compilación del puente nativo) tras cada operación.

## Decisión

- Mantener un helper de cifrado por referencia, máximo cinco, solo durante una
  corrida. Comandos por pipe privado, serializados, con plazo de cinco segundos,
  respuesta acotada y cierre ante error/cancelación. No se relanza automáticamente.
- Cada comando vuelve a leer y validar la credencial DPAPI y su propósito. No se
  cachean claves descifradas, resultados de disponibilidad ni bloques cifrados.
  Se preserva la revocación durante una corrida y el borrado de buffers por uso.
- Conservar el proceso/handle PC/SC del lector dentro de la corrida y liberar
  su transacción exclusiva entre operaciones. Cada lectura comprueba vigencia,
  adquiere exclusión y ejecuta SELECT/GPO/READ nuevos. La adquisición financiera
  conserva su relectura exclusiva y GENERATE AC nuevo. No se cachea el contexto
  transaccional ni se elimina la comprobación de identidad.
- Consumir el readId y borrar los campos privados al terminar la operación.
  Retiro de tarjeta, error, timeout, cancelación o cierre invalidan el handle.
  La operación manual conserva el cierre por transacción existente.
- Distinguir completar el plan de alcanzar su promedio objetivo. En modo LOAD,
  una corrida completada por debajo de la tasa pedida muestra «TPS no alcanzados».
  El promedio incluye preparación y cierre; no certifica ritmo sostenido. STRESS
  conserva su gráfica de rampa, sin comparar el promedio con el pico como veredicto.
- El preset 3 TPS propone cinco operaciones simultáneas, sustituyendo las cuatro
  de ADR-027. La captura muestra p95 de respuesta de 1,434 s: solo esa espera
  requiere al menos ceil(3 × 1,434) = 5 slots, antes de considerar preparación.
  Cinco sigue siendo el límite local y no garantiza el objetivo.

No cambia el contrato ISO, la asignación STAN/RRN, el limitador global, los
límites locales ni la política de parar al primer error. No se reutilizan sockets.

## Verificación y límites

Regresiones: identidad fresca/consumida, exclusión durante release, retiro,
cancelación y timeout; protocolo de helper fragmentado, salida inválida, cola,
cierre y validación de entradas; proceso PC/SC sintético Windows reutilizado;
DPAPI real Windows con vectores sintéticos distintos y revocación del archivo
en caliente; ciclo de vida del driver; UI y recuperación de resultado bajo objetivo.

El benchmark local de cifrado se guarda sin datos privados en
`artifacts/load-cipher-benchmark.json`: mide un cifrado en frío y doce comandos
en el proceso ya iniciado. La medición dirigida inicial fue 1.996 ms frente a
21,1 ms promedio. Excluye chip, diálogo PIN, TCP y host, y no demuestra 3 TPS.

TODO-DATA LOAD-3TPS-PHYSICAL: repetir con ambos ATM y tarjeta reales, conservar
la serie temporal y el desglose. Si la preparación exclusiva supera 333 ms por
consulta, no abastece 3 TPS; añadir slots no corrige ese cuello de botella.
LOAD-VIRTUAL-PROVIDER y LOAD-PERSISTENT-TCP mantienen sus contratos pendientes.
