# Product Specification

## Nombre de trabajo

Coonecta ATM Transaction Simulator.

## Problema

QA necesita ejecutar y repetir transacciones ATM de forma controlada sin depender de un cajero fisico completo, cambiar rapidamente entre entidades/tarjetas, reproducir escenarios reales, ejecutar carga y observar el recorrido de la transaccion en Switch y Core.

## Usuarios

- QA, inicialmente.
- Produccion/Soporte quedan fuera del MVP pero la arquitectura no debe impedir incorporarlos.

## Ambientes

- QA: habilitado.
- PREPROD: habilitado.
- PROD: deshabilitado por diseno.

## Escenarios

### ATM Local
ATM y tarjeta pertenecen a la misma entidad.

### ATM RTC
ATM y tarjeta pertenecen a entidades distintas dentro de Coonecta.

### BANRED
ATM Coonecta con tarjeta procesada por BANRED.

### Externa
ATM Coonecta con tarjeta de una red o entidad externa configurada.

## Capacidades principales

- Seleccionar ambiente, entidad adquirente, ATM, tarjeta y transaccion.
- Leer tarjeta fisica con OMNIKEY 5422.
- Resolver perfil de tarjeta por datos disponibles y BIN/identificador.
- Crear/editar perfiles de ATM y tarjeta.
- Construir y enviar ISO8583.
- Mostrar request/response en vista Parseada/ASCII/HEX.
- Validar resultados automaticamente.
- Generar reverso manual y automatico por timeout.
- Ejecutar N transacciones en un ATM o distribuirlas entre multiples ATM.
- Ejecutar carga por TPS y duracion.
- Ver dashboard realtime por maquina y por prueba.
- Correlacionar con SmartVista y Core.
- Exportar resultados.

## No objetivos MVP

- Simular VISA e-commerce.
- Procesar produccion.
- Emular toda la logica de un kernel EMV certificado.
- Administrar llaves productivas.
