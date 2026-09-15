import { describe, expect, it } from 'vitest';

import { attachmentFileName } from './content-disposition';

describe('attachmentFileName', () => {
  it('lit un nom entre guillemets', () => {
    expect(
      attachmentFileName('attachment; filename="BROUILLON-prelevement-CORE-552100554-2026-09.xml"'),
    ).toBe('BROUILLON-prelevement-CORE-552100554-2026-09.xml');
  });

  it('lit un nom sans guillemets', () => {
    expect(attachmentFileName('attachment; filename=prelevement-B2B.xml')).toBe(
      'prelevement-B2B.xml',
    );
  });

  it('préfère `filename*`, décodé, à `filename`', () => {
    expect(
      attachmentFileName(
        'attachment; filename="prelevement.xml"; filename*=UTF-8\'\'pr%C3%A9l%C3%A8vement-CORE.xml',
      ),
    ).toBe('prélèvement-CORE.xml');
  });

  it('retombe sur `filename` quand `filename*` est mal encodé', () => {
    expect(
      attachmentFileName('attachment; filename="secours.xml"; filename*=UTF-8\'\'%E0%A4%A.xml'),
    ).toBe('secours.xml');
  });

  it('rend `null` sans en-tête, ou sans nom', () => {
    expect(attachmentFileName(null)).toBeNull();
    expect(attachmentFileName('attachment')).toBeNull();
    expect(attachmentFileName('attachment; filename=""')).toBeNull();
  });
});
