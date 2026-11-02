# Revisión técnica — 2026-11-02

## Alcance

Revisión centrada en carga, su integración con saldo/retiro, contratos IPC,
persistencia, cancelación y herramientas de validación. No constituye una auditoría
exhaustiva de cada adaptador o del host/Core.

## Defectos corregidos

1. **Plan mutable tras validar**: `parseLoadTestDraft` devolvía el objeto del
   llamador. Cambiar TPS/cantidad/perfiles durante una espera de almacenamiento
   alteraba el plan aceptado. Ahora copia el plan antes del primer `await`.
   La regresión con almacenamiento retrasado falla con la implementación anterior
   y pasa con la corrección; verifica también el plan persistido.
2. **Preflight incompleto**: la carga solo revisaba pendientes de saldo. Ahora
   comprueba además retiros/reversos sin finalizar y fallos de persistencia de
   retiro antes de iniciar la sesión PIN. Reutiliza la regla existente de ADR-025;
   no bloquea por errores históricos terminados ni los reclasifica.
3. **Configuración Playwright inválida**: `trace`, `video` y `screenshot` estaban
   en la raíz del archivo, fuera del contrato tipado. Se colocan bajo `use`,
   eliminando el error de `typecheck`. La disponibilidad de cada diagnóstico
   depende del contexto que cree cada prueba, incluidas las sesiones Electron.

## Deuda reducida y funcionalidad

El plan discrimina saldo sin importe y retiro con importe obligatorio. Se usa el
validador de montos existente; no se duplican reglas ISO, PIN/EMV ni manejo del
diario. El driver comparte worker, sesiones, límite TPS, métricas y recuperación,
seleccionando el servicio financiero por operación. Se preserva la exclusión de
retiro y la compatibilidad de corridas antiguas. Alcance y criterios en ADR-031.

## Validación local

- Lint, TypeScript strict, formato, build y chequeo de secretos: correctos.
- Suite unitaria completa: 1006 pruebas correctas en 61 archivos.
- Suite de integración completa: 263 pruebas correctas en 42 archivos.
- Regresión Electron de carga/retiros/reversos y recorridos relacionados:
  22 pruebas correctas, incluida recuperación del monto tras recarga.
- TCP de carga: dos ATM alternados, importes de retiro, STAN y UUID nuevos,
  PIN una vez, aprobación/rechazo/timeout/parada y recuperación SQLite.

## Deuda pendiente identificada

`npm audit` reportó 11 entradas moderadas en la cadena de herramientas de
ESLint/TypeScript-ESLint, derivadas de `minimatch@10.2.6`, con rango afectado
`<11.0.1`: [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249).
No son once causas independientes. El reporte automático propone cambios mayores
de ESLint/TypeScript-ESLint; no se aplicó una degradación ni un override mayor sin
verificar su compatibilidad. Requiere actualizar la cadena de lint a versiones
compatibles con la corrección y repetir sus validaciones en un cambio separado.

TODO-DATA LOAD-WITHDRAWAL-QA-ACCEPTANCE mantiene pendiente la validación de carga
con chip y host reales. Las pruebas locales no miden capacidad del switch ni
confirman débitos en Core. No se enviaron transacciones financieras al host QA.
