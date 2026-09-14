import {
  EMPTY_MANDATE_OPTIONS_DRAFT,
  MANDATE_OPTIONS_FORM_LABELS_FR,
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
