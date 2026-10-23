import { describe, expect, it } from 'vitest';

import { accountBankNames, sameName } from './account-bank-names';

describe('accountBankNames', () => {
  it('enseigne en tête, raison sociale dessous', () => {
    expect(
      accountBankNames({
        companyName: 'SAS Les Tommeuses',
        tradeName: 'Fromagerie Tom',
        holder: 'SAS Les Tommeuses',
      }),
    ).toEqual({ headline: 'Fromagerie Tom', legalName: 'SAS Les Tommeuses', holder: null });
  });

  it('sans enseigne : la raison sociale seule, pas répétée', () => {
    expect(
      accountBankNames({
        companyName: 'SAS Les Tommeuses',
        tradeName: null,
        holder: 'SAS Les Tommeuses',
      }),
    ).toEqual({ headline: 'SAS Les Tommeuses', legalName: null, holder: null });
  });

  it('montre le titulaire quand il diffère', () => {
    expect(
      accountBankNames({
        companyName: 'SAS Les Tommeuses',
        tradeName: '  ',
        holder: 'M. Tom Dupont',
      }).holder,
    ).toBe('M. Tom Dupont');
  });
});

describe('sameName', () => {
  it('ignore casse, accents et espaces', () => {
    expect(sameName('Épicerie  Élise', 'epicerie elise')).toBe(true);
  });
  it('distingue deux noms différents', () => {
    expect(sameName('Café A', 'Café B')).toBe(false);
  });
});
