import { expect, it } from 'vitest';
import {
  cmsFinancialFields,
  isProtectedCmsStructure,
  reviewFinancialStructure,
} from '../../apps/desktop/src/main/adapters/cms-financial-contract';
import { decodeResponse } from '../../apps/desktop/src/main/adapters/mediator-observer';
import { observationBatch } from '../helpers/observations';

function structure(direction: 'request' | 'response'): string {
  const block = (section: string, tag: string) =>
    cmsFinancialFields
      .filter((field) => field.section === section && field.required.includes(direction))
      .map((field) => `<${tag} name="${field.name}">[PROTEGIDO]</${tag}>`)
      .join('');
  return `<ExtremeMsg><Header>${block('Header', 'HField')}</Header><Data>${block('Data', 'DField')}</Data></ExtremeMsg>`;
}

it.each([
  ['request', 26],
  ['response', 21],
] as const)('reviews %s required fields from the documented table', (direction, count) => {
  const result = reviewFinancialStructure(structure(direction), direction);
  expect(result).toEqual({
    status: 'REVIEWED',
    requiredFieldCount: count,
    missingRequired: [],
    aliases: [],
    typeDifferences: [],
    duplicates: [],
  });
});

it('recognizes observed aliases without rewriting the protected source or losing mandatory fields', () => {
  const source = structure('request').replace('TerminalID', 'TerminalId').replace('País', 'Pais');
  const report = reviewFinancialStructure(source, 'request');
  expect(report.missingRequired).toEqual([]);
  expect(report.aliases).toEqual([
    { section: 'Header', observedName: 'TerminalId', documentedName: 'TerminalID' },
    { section: 'Data', observedName: 'Pais', documentedName: 'País' },
  ]);
  const response = structure('response').replace('Mensaje de Retorno', 'MensajeRetorno');
  expect(reviewFinancialStructure(response, 'response').missingRequired).toEqual([]);
  expect(reviewFinancialStructure(response, 'response').aliases).toContainEqual({
    section: 'Data',
    observedName: 'MensajeRetorno',
    documentedName: 'Mensaje de Retorno',
  });
  expect(source).toContain('name="TerminalId"');
});

it('reports table/example type conflicts and alias duplicates rather than inventing conversion rules', () => {
  const source = structure('request')
    .replace('name="EsPos"', 'name="EsPos" type="b"')
    .replace('</Header>', '<HField name="TerminalId">[PROTEGIDO]</HField></Header>');
  const report = reviewFinancialStructure(source, 'request');
  expect(report.typeDifferences).toEqual([
    { section: 'Data', name: 'EsPos', observed: 'b', documented: 'string' },
  ]);
  expect(report.duplicates).toEqual([{ section: 'Header', name: 'TerminalID' }]);
});

it('preserves the documented commission-name variant as optional evidence', () => {
  const source =
    '<ExtremeMsg><Header></Header><Data><DField name="ComEmisor" type="f">[PROTEGIDO]</DField></Data></ExtremeMsg>';
  const report = reviewFinancialStructure(source, 'request');
  expect(report.aliases).toContainEqual({
    section: 'Data',
    observedName: 'ComEmisor',
    documentedName: 'ComEntidad',
  });
  expect(report.missingRequired).not.toContainEqual({ section: 'Data', name: 'ComEntidad' });
});

it('reports absent fields and does not count a field in the wrong section or nested table', () => {
  const source =
    '<ExtremeMsg><Header><HField name="Moneda">[PROTEGIDO]</HField></Header><Data><FxTable><DField name="Moneda">[PROTEGIDO]</DField></FxTable></Data></ExtremeMsg>';
  expect(reviewFinancialStructure(source, 'request').missingRequired).toContainEqual({
    section: 'Data',
    name: 'Moneda',
  });
});

it.each([
  '<Data>PRIVATE_VALUE</Data>',
  '<HField name="RetCode" value="PRIVATE_VALUE"></HField>',
  '<HField name="RetCode" type="PRIVATE_VALUE">[PROTEGIDO]</HField>',
  '<ExtremeMsg><Header></ExtremeMsg></Header>',
  '<ExtremeMsg></ExtremeMsg><ExtremeMsg></ExtremeMsg>',
  '<!DOCTYPE x><ExtremeMsg></ExtremeMsg>',
  '<HField name="UNKNOWN">[PROTEGIDO]</HField>',
  '<Campo>'.repeat(22) + '</Campo>'.repeat(22),
])('rejects unsafe or malformed protected structures', (source) => {
  expect(isProtectedCmsStructure(source)).toBe(false);
  expect(reviewFinancialStructure(source, 'request').status).toBe('UNAVAILABLE');
});

it('does not classify an unavailable message as missing mandatory fields', () => {
  expect(
    reviewFinancialStructure('[Mensaje protegido: XML no validado]', 'response'),
  ).toMatchObject({ status: 'UNAVAILABLE', missingRequired: [] });
});

it('computes its own protected review and drops untrusted annotations from the process', () => {
  const batch = observationBatch();
  const result = decodeResponse(
    JSON.stringify({
      ok: true,
      value: {
        ...batch,
        rows: [
          {
            ...batch.rows[0],
            transactionCode: '301000',
            requestStructure: structure('request'),
            requestContract: { status: 'REVIEWED', missingRequired: ['PRIVATE_VALUE'] },
          },
        ],
      },
    }),
    50,
  );
  expect(result).toMatchObject({
    ok: true,
    value: { rows: [{ requestContract: { requiredFieldCount: 26, missingRequired: [] } }] },
  });
  expect(JSON.stringify(result)).not.toContain('PRIVATE_VALUE');
});
