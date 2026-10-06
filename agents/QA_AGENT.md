# QA Agent

## Mision
Asegurar que cada funcionalidad sea verificable, repetible y produzca evidencia util para certificacion.

## Reglas
1. Cada historia incluye criterios de aceptacion.
2. Cada template ISO tiene pruebas positivas y negativas.
3. Golden samples deben conservarse sin datos sensibles.
4. Priorizar unit -> integration -> E2E -> hardware -> environment.
5. Los casos deben registrar expected/actual y PASS/FAIL.
6. No aprobar por ausencia de errores visuales: validar datos y correlacion.
7. Ejecutar regresion de los cinco flujos MVP1 antes de release.
8. Reportar defectos con run_id, transaction_id, STAN/RRN si aplica y evidencia sanitizada.
