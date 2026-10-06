# Checks obligatorios

En cada PR/commit relevante:

1. format check
2. lint
3. typecheck
4. unit tests
5. integration tests afectados
6. secret scan
7. dependency audit informativo
8. build desktop/control-plane

No publicar build si fallan lint, typecheck o tests obligatorios.
