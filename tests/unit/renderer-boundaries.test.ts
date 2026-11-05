import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { builtinModules } from 'node:module';
import ts from 'typescript';
import { expect, it } from 'vitest';
it('mantiene transporte, secretos y persistencia fuera del Renderer', () => {
  const directory = 'apps/desktop/src/renderer';
  const violations: string[] = [];
  for (const file of readdirSync(directory).filter((file) => /\.tsx?$/.test(file))) {
    const source = ts.createSourceFile(
      file,
      readFileSync(join(directory, file), 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    const visit = (node: ts.Node) => {
      if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
        const dependency = node.moduleSpecifier.text;
        if (
          dependency.startsWith('node:') ||
          builtinModules.includes(dependency) ||
          dependency === 'electron' ||
          dependency.includes('/main/')
        )
          violations.push(`${file}: ${dependency}`);
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  expect(violations).toEqual([]);
});
