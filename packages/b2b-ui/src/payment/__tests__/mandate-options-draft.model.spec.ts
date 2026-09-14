import {
  EMPTY_MANDATE_OPTIONS_DRAFT,
  MANDATE_OPTIONS_FORM_LABELS_FR,
  mandateOptionsDraftChanged,
  mandateOptionsDraftFrom,
  toMandateOptionsPayload,
} from '../mandate-options-draft.model';

describe('brouillon des zones facultatives du mandat', () => {
  it('reprend les deux zones de la vue, et rien d’autre', () => {
    expect(
      mandateOptionsDraftFrom({ debtorReference: 'C-9P2X4B', contractNumber: 'CT-12' }),
    ).toEqual({ debtorReference: 'C-9P2X4B', contractNumber: 'CT-12' });
  });

  it('part de deux zones vides — la norme les dit indicatives', () => {
    expect(EMPTY_MANDATE_OPTIONS_DRAFT).toEqual({ debtorReference: '', contractNumber: '' });
  });

  it('envoie les deux zones rognées, vides permises', () => {
    expect(
      toMandateOptionsPayload({ debtorReference: '  REF-2026 ', contractNumber: '  ' }),
    ).toEqual({ debtorReference: 'REF-2026', contractNumber: '' });
  });

  describe('modifié ou non', () => {
    const SAVED = { debtorReference: 'C-9P2X4B', contractNumber: 'CT-12' };

    it('les zones relues, intactes : rien n’a changé', () => {
      expect(mandateOptionsDraftChanged(mandateOptionsDraftFrom(SAVED), SAVED)).toBe(false);
    });

    it('une zone corrigée est une modification — un espace ajouté ne l’est pas', () => {
      expect(mandateOptionsDraftChanged({ ...SAVED, contractNumber: 'CT-13' }, SAVED)).toBe(true);
      expect(mandateOptionsDraftChanged({ ...SAVED, debtorReference: ' C-9P2X4B ' }, SAVED)).toBe(
        false,
      );
    });

    it('vider une zone est une modification', () => {
      expect(mandateOptionsDraftChanged({ ...SAVED, contractNumber: '' }, SAVED)).toBe(true);
    });

    it('sans zones lues, la référence est le brouillon vide', () => {
      expect(mandateOptionsDraftChanged(EMPTY_MANDATE_OPTIONS_DRAFT, null)).toBe(false);
      expect(
        mandateOptionsDraftChanged({ ...EMPTY_MANDATE_OPTIONS_DRAFT, contractNumber: 'X' }, null),
      ).toBe(true);
    });
  });

  it('les libellés par défaut sont ceux de la fiche staff', () => {
    expect(MANDATE_OPTIONS_FORM_LABELS_FR).toEqual({
      debtorReference: 'Code identifiant du débiteur',
      debtorReferenceHint: 'Zone 14 — ce que le client verra revenir sur son relevé bancaire.',
      debtorReferencePlaceholder: 'C-9P2X4B',
      contractNumber: 'Numéro du contrat',
      contractNumberHint: 'Zone 19 — facultatif.',
    });
  });
});
