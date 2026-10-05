import { legalFormLabelFor } from '../legal-form-label';

describe('legalFormLabelFor', () => {
  /** Régression du 2026-10-05 : la fiche client montrait la clé « foreign ». */
  it('dit « Société de droit étranger » pour la clé foreign', () => {
    expect(legalFormLabelFor('foreign')).toBe('Société de droit étranger');
  });

  it('dit le libellé d’une clé de la liste', () => {
    expect(legalFormLabelFor('auto_entrepreneur')).toBe('Auto-entrepreneur');
  });

  it('reconnaît une saisie d’avant la liste', () => {
    expect(legalFormLabelFor('S.A.S.')).toBe('SAS');
  });

  it('rend telle quelle une saisie qu’il ne reconnaît pas', () => {
    expect(legalFormLabelFor('GmbH')).toBe('GmbH');
  });
});
