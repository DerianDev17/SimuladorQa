import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve, relative, sep } from 'node:path';
import { builtinModules } from 'node:module';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import boundaries from '../../tooling/architecture-boundaries.json';

const domain = resolve('packages/domain/src');
const shared = resolve('packages/shared/src');
const renderer = resolve('apps/desktop/src/renderer');
const main = resolve('apps/desktop/src/main');
const within = (path: string, directory: string) => path.startsWith(directory + sep);
function imports(source: string): string[] {
  const file = ts.createSourceFile(
    'module.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const result: string[] = [];
  function visit(node: ts.Node): void {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    )
      result.push(node.moduleSpecifier.text);
    if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteral(node.argument.literal)
    )
      result.push(node.argument.literal.text);
    if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
    ) {
      const argument = node.arguments[0];
      result.push(argument && ts.isStringLiteral(argument) ? argument.text : '<dynamic>');
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return result;
}
function files(directory: string): string[] {
  return readdirSync(directory, { recursive: true, encoding: 'utf8' })
    .filter((name) => /\.tsx?$/.test(name))
    .map((name) => resolve(directory, name));
}

describe('límites de arquitectura', () => {
  it('inspecciona imports de tipos, reexports, require e imports dinámicos', () => {
    expect(
      imports(`import type { A } from './a'; export { B } from './b';
      type C = import('./c').C; const d = import('./d'); const e = require('node:net');
      import(variable);`),
    ).toEqual(['./a', './b', './c', './d', 'node:net', '<dynamic>']);
  });
  it('dominio solo depende de dominio; contratos públicos solo de dominio y shared', () => {
    const violations: string[] = [];
    for (const directory of [domain, shared])
      for (const file of files(directory)) {
        for (const dependency of imports(readFileSync(file, 'utf8'))) {
          const target = resolve(dirname(file), dependency);
          if (
            !dependency.startsWith('.') ||
            !(within(target, domain) || (directory === shared && within(target, shared)))
          )
            violations.push(`${relative(process.cwd(), file)} -> ${dependency}`);
        }
      }
    expect(violations).toEqual([]);
  });
  it('Renderer solo consume UI y contratos públicos, sin importar Main o Node', () => {
    const violations: string[] = [];
    for (const file of files(renderer))
      for (const dependency of imports(readFileSync(file, 'utf8'))) {
        const target = resolve(dirname(file), dependency);
        const allowed = dependency.startsWith('.')
          ? [renderer, domain, shared].some((directory) => within(target, directory))
          : ['react', 'react-dom/client'].includes(dependency);
        if (!allowed) violations.push(`${relative(process.cwd(), file)} -> ${dependency}`);
      }
    expect(violations).toEqual([]);
  });
  it('motores y contratos no conocen adaptadores, almacenamiento ni fachadas concretas', () => {
    const violations: string[] = [];
    for (const name of boundaries.protectedMainFiles)
      for (const dependency of imports(readFileSync(resolve(main, name), 'utf8'))) {
        const target = resolve(main, dependency).replace(/\.[cm]?[jt]sx?$/, '');
        const allowed = dependency.startsWith('.')
          ? [domain, shared].some((directory) => within(target, directory)) ||
            (dirname(target) === main &&
              !boundaries.concreteMainModules.some((name) => target === resolve(main, name)))
          : dependency === 'node:perf_hooks';
        if (!allowed || (builtinModules.includes(dependency) && dependency !== 'node:perf_hooks'))
          violations.push(`${name} -> ${dependency}`);
      }
    expect(violations).toEqual([]);
  });
  it('adaptadores de exportación e historial no importan servicios de aplicación', () => {
    const violations: string[] = [];
    for (const name of [
      'adapters/electron-export-dialog.ts',
      'infrastructure/file-load-export.ts',
      'infrastructure/sqlite-balance-journal.ts',
    ]) {
      const file = resolve(main, name);
      for (const dependency of imports(readFileSync(file, 'utf8'))) {
        const target = resolve(dirname(file), dependency).replace(/\.[cm]?[jt]sx?$/, '');
        if (dirname(target) === main && target.endsWith('-service'))
          violations.push(`${name} -> ${dependency}`);
      }
    }
    expect(violations).toEqual([]);
  });
});
