import { WEEKDAYS } from '../delivery-format';
import { contactIssueOf, EMPTY_DELIVERY_SPECS } from '../delivery-draft.model';
import {
  DELIVERY_SPECS_LABELS_FR,
  type DeliverySpecsLabels,
  signatureOptionsOf,
} from '../delivery-specs/delivery-specs.labels';

describe('libellés de DeliverySpecs', () => {
  /**
   * Le défaut est le texte d'avant l'entrée, mot pour mot : le back-office ne
   * passe rien, et il ne doit pas changer d'un caractère.
   */
  it('le défaut reprend le texte écrit en dur avant l’entrée', () => {
    expect(DELIVERY_SPECS_LABELS_FR).toMatchObject({
      detailLegend: 'Détail de livraison',
      slotsLegend: 'Créneaux préférés',
      sameEveryDay: 'Le même créneau tous les jours',
      everyDay: 'Tous les jours',
      slotStart: 'Début',
      slotEnd: 'Fin',
      contactLegend: 'Contact sur place',
      knownContact: 'Reprendre un contact connu',
      firstName: 'Prénom',
      lastName: 'Nom',
      phone: 'Téléphone',
      signature: 'Signature à la remise',
    });
  });

  it('les jours par défaut sont ceux de WEEKDAYS, dans le même ordre', () => {
    expect(WEEKDAYS.map((day) => DELIVERY_SPECS_LABELS_FR.weekdays[day.value])).toEqual(
      WEEKDAYS.map((day) => day.label),
    );
  });

  it('le message de contact incomplet par défaut est celui de la règle', () => {
    const incomplete = { ...EMPTY_DELIVERY_SPECS, noContact: false };
    expect(DELIVERY_SPECS_LABELS_FR.contactIncomplete).toBe(contactIssueOf(incomplete));
  });

  it('les options de signature par défaut nomment le socle hérité', () => {
    expect(signatureOptionsOf(DELIVERY_SPECS_LABELS_FR, true)).toEqual([
      { value: 'inherit', label: 'Comme la société (exigée)' },
      { value: 'yes', label: 'Exigée' },
      { value: 'no', label: 'Non exigée' },
    ]);
    expect(signatureOptionsOf(DELIVERY_SPECS_LABELS_FR, false)[0]?.label).toBe(
      'Comme la société (non exigée)',
    );
  });

  it('des libellés passés remplacent le défaut, socle compris', () => {
    const english: DeliverySpecsLabels = {
      ...DELIVERY_SPECS_LABELS_FR,
      signatureInherit: 'Same as the company ({floor})',
      signatureFloorRequired: 'required',
      signatureFloorNotRequired: 'not required',
      signatureRequired: 'Required',
      signatureNotRequired: 'Not required',
    };
    expect(signatureOptionsOf(english, false).map((option) => option.label)).toEqual([
      'Same as the company (not required)',
      'Required',
      'Not required',
    ]);
  });
});
