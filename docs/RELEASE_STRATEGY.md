# Estrategia de releases

**Estrategia objetivo.** Actualmente `npm run build` genera la aplicación local
en `dist/`; `npm start` la ejecuta. No hay pipeline de publicación, instalador
firmado ni paquete Control Plane. La CI valida el desktop, como se describe en
[CI_CHECKS.md](CI_CHECKS.md). Los canales y artefactos siguientes están propuestos.

## Canales
- dev
- qa
- preprod

## Versionado
SemVer para app y Control Plane.

## Artefactos
- instalador Electron Windows
- checksums
- release notes

## Migraciones
Cambios SQLite/PostgreSQL deben tener migraciones versionadas y reversibles cuando sea razonable.
