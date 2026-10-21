import type { ProductionDayResupply } from '@lfd/contracts';

import { resupplySheetsOf, resupplySiteLabel } from './resupply-sheets';

function resupply(resupplyId: string, siteLabel: string | null): ProductionDayResupply {
  return {
    resupplyId,
    siteId: `site-${resupplyId}`,
    siteLabel,
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
