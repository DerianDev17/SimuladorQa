# Estructura de repositorio

Implementado inicialmente: `apps/desktop`, `packages/domain`, `packages/shared`,
`tests/unit`, `tests/integration`, `tests/e2e` y `tooling`. El resto de componentes
del siguiente diagrama sigue planificado; no se generan stubs que simulen estar operativos.

```text
coonecta-atm-simulator/
├── AGENTS.md
├── README.md
├── ARCHITECTURE.md
├── apps/
│   ├── desktop/
│   └── control-plane/
├── packages/
│   ├── domain/
│   ├── iso8583/
│   ├── tcp-engine/
│   ├── transaction-engine/
│   ├── load-engine/
│   ├── card-reader/
│   ├── smartvista-adapter/
│   ├── core-adapters/
│   ├── observability/
│   └── shared/
├── docs/
├── references/
│   ├── iso/
│   ├── pcaps/
│   ├── banred/
│   ├── manuals/
│   └── sql/
├── tests/
│   ├── fixtures/
│   ├── integration/
│   └── e2e/
└── tooling/
```

## Regla
`references/` contiene evidencia de proyecto; no debe ser importada directamente por codigo productivo sin pasar por templates/configuracion versionada.
