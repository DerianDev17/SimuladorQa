# Stack tecnico propuesto

## Desktop
- Electron
- React
- TypeScript strict
- Vite

## Estado/UI
Seleccionar durante implementacion una solucion minima; evitar complejidad innecesaria.

## Backend local
- Electron Main
- Node TCP sockets
- Worker Threads o procesos hijos para carga
- SQLite

## PC/SC
Libreria Node compatible con PC/SC elegida tras prueba real con OMNIKEY 5422 y Windows objetivo.

## Control Plane
- Node.js + TypeScript
- REST + WebSocket
- PostgreSQL

## Testing
- unit/integration runner para TypeScript
- Playwright para E2E Electron si resulta compatible con el empaquetado elegido

## Packaging
- instalador Windows firmado cuando infraestructura lo permita.
