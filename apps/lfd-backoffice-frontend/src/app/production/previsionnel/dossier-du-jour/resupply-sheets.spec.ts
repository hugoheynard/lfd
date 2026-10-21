import type { ProductionDayResupply } from '@lfd/contracts';

import { resupplySheetsOf, resupplySheetTitle, resupplySiteLabel } from './resupply-sheets';

function resupply(
  resupplyId: string,
  siteLabel: string | null,
  name: string | null = null,
): ProductionDayResupply {
  return {
    resupplyId,
    siteId: `site-${resupplyId}`,
    siteLabel,
    name,
    servedByTransfer: true,
    lines: [{ sku: 'CRO', productName: 'Croissant', quantity: 6 }],
  };
}

describe('resupplySheetsOf', () => {
  it('un bon par réassort, par point puis par identifiant — jamais fusionnés', () => {
    const sheets = resupplySheetsOf([
      resupply('r-2', 'Village'),
      resupply('r-1', 'Village'),
      resupply('r-3', 'Labo'),
    ]);
    expect(sheets.map((sheet) => sheet.resupplyId)).toEqual(['r-3', 'r-1', 'r-2']);
  });

  it('dit un point sans nom par son identifiant', () => {
    expect(resupplySiteLabel(resupply('r-9', null))).toBe('site-r-9');
  });
});

describe('resupplySheetTitle (R1g)', () => {
  it('« <nom> — <point> » s’il est nommé, « Réassort <point> » sinon', () => {
    expect(resupplySheetTitle(resupply('r-1', 'Village', 'Vitrine du matin'))).toBe(
      'Vitrine du matin — Village',
    );
    expect(resupplySheetTitle(resupply('r-2', 'Village'))).toBe('Réassort Village');
  });
});
