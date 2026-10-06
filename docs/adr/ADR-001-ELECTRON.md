# ADR-001: Electron + TypeScript + React

## Decision
Usar Electron como shell desktop, React para UI y TypeScript estricto en todo el codigo propio.

## Motivos
- requisito explicito de app desktop Electron;
- integracion con Windows/PCSC;
- sockets TCP disponibles en Node;
- empaquetado para multiples estaciones QA;
- reutilizacion de TypeScript entre UI, dominio y control plane.

## Consecuencia
Aislar operaciones privilegiadas en Main/Workers y exponer un IPC minimo y tipado al Renderer.
