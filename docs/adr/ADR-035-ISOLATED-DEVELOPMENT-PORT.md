# ADR-035: Puerto local independiente por sesión de desarrollo

Fecha: 2026-11-04. Estado: implementado.

## Problema verificado

La prueba E2E de desarrollo falló con `Port 5173 is already in use` cuando la
aplicación del operador estaba abierta. Vite, Electron, CSP, el postproceso del
build y el test dependían del mismo puerto fijo. La instrucción del usuario es
reducir deuda técnica y resolver esa dependencia sin requerir configuración manual.

## Decisión

Vite solicita `127.0.0.1:0`: el sistema operativo reserva un puerto libre al
abrir el servidor, sin un sondeo previo que pueda competir con otro proceso.
El lanzador lee la dirección del servidor activo y pasa `--dev-port` a Electron.
Main admite exactamente un entero entre 1 y 65535 y construye la URL con host
y protocolo fijos. No admite hosts, rutas ni URLs arbitrarias. La comprobación
IPC y el bloqueo de navegación conservan la comparación con la URL exacta.
El argumento solo se usa en `--dev`; la compilación normal carga el archivo local.

El HTML fuente tiene la CSP de compilación normal: sin conexiones ni scripts/
estilos inline. Vite amplía esas directivas únicamente cuando sirve desarrollo,
con WebSocket hacia su puerto exacto. Se elimina el reemplazo posterior del HTML
en `build.mjs`, que dependía del texto y puerto antiguos. No se admiten comodines.
Las pruebas de Vite usan además cachés temporales para no invalidar la sesión
del operador. Cerrar cada prueba libera únicamente sus propios recursos.

## Aceptación

- Dos servidores Vite de la misma app coexisten con puertos distintos.
- Electron carga React, recarga y mantiene IPC solo con su origen asignado.
- El lanzador real en Windows abre la ventana y entrega el puerto activo.
- Main rechaza puertos ausentes, duplicados, fuera de rango y valores con URL.
- La app compilada mantiene aislamiento, `connect-src 'none'` y ausencia de inline.
- No se modifica el destino TCP financiero, las credenciales o las reglas ISO.

Verificación: `tests/unit/security.test.ts` y los E2E de desarrollo, lanzador
nativo y aislamiento de `tests/e2e/desktop.spec.ts`.
