import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

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
});
