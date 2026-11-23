import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import boundaries from '../../tooling/architecture-boundaries.json';

describe('compatibilidad de glob y límites de ESLint', () => {
  const eslint = new ESLint();
  it.each([
    'apps/desktop/src/renderer/boundary-probe.tsx',
    'packages/domain/src/boundary-probe.ts',
    'packages/shared/src/boundary-probe.ts',
  ])('aplica restricciones nativas a %s', async (filePath) => {
    const [result] = await eslint.lintText("import net from 'node:net'; export default net;", {
      filePath,
    });
    expect(result?.messages.some((message) => message.ruleId === 'no-restricted-imports')).toBe(
      true,
    );
  });
  it('conserva la exclusión de artefactos generados', async () => {
    expect(await eslint.isPathIgnored('dist/main.cjs')).toBe(true);
  });
  it.each(boundaries.protectedMainFiles)('protege dependencias de Main en %s', async (name) => {
    const [result] = await eslint.lintText(
      `import type { Adapter } from './adapters/example';
       import type { Store } from './infrastructure/example';
       import fs from 'node:fs';
       import net from 'net';
       import promises from 'fs/promises';
       export { SendConfigurationService } from './send-configuration-service.ts';
       export { DepositService } from './deposit-service';
       export type { Adapter, Store };
       export { fs, net, promises };`,
      { filePath: `apps/desktop/src/main/${name}` },
    );
    expect(
      result?.messages.filter((message) => message.ruleId === 'no-restricted-imports'),
    ).toHaveLength(7);
  });
  it('permite puertos, dominio y reloj monotónico en los servicios protegidos', async () => {
    const [result] = await eslint.lintText(
      `import type { SendConfigurationPort } from './send-configuration-port';
       import type { LoadExportSink } from './load-export-ports';
       import type { Environment } from '../../../../packages/domain/src/index';
       import { performance } from 'node:perf_hooks';
       export type { SendConfigurationPort, LoadExportSink, Environment };
       export { performance };`,
      { filePath: 'apps/desktop/src/main/application.ts' },
    );
    expect(result?.messages).toEqual([]);
  });
});
